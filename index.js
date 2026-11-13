import express from "express"
import { MongoClient, ObjectId } from 'mongodb';
import { createHmac, timingSafeEqual } from 'node:crypto';
import 'dotenv/config'
import cors from "cors"

const app = express()
const PORT = 8000

const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000"

app.use(cors({
  origin: CLIENT_URL,
  credentials: true,
}))
app.use(express.json())

//http://localhost:8000/

const client = new MongoClient(process.env.MONGODB_URL);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}

const mongoClient = await  connectToMongoDB()
const db = mongoClient.db("BookNook")
const bookCollection = db.collection("Book")
const sessionCollection = db.collection("session")
const userCollection = db.collection("user")

const AUTH_SECRET = process.env.BETTER_AUTH_SECRET || ""
const SESSION_COOKIE_NAME = "better-auth.session_token"

// better-auth stores the session token in a signed, URL-encoded cookie:
//   better-auth.session_token=<token>.<base64 HMAC-SHA256 signature>
// The same token can also be sent as `Authorization: Bearer <token>`.
const parseCookieHeader = (header = "") => {
  const cookies = new Map()

  for (const part of header.split(";")) {
    const separator = part.indexOf("=")

    if (separator === -1) continue

    const name = part.slice(0, separator).trim()

    if (!name) continue

    let value = part.slice(separator + 1).trim()

    try {
      value = decodeURIComponent(value)
    } catch {
      // Keep the raw value when it is not valid percent-encoding.
    }

    if (!cookies.has(name)) cookies.set(name, value)
  }

  return cookies
}

const getSessionValue = (req) => {
  const cookies = parseCookieHeader(req.headers.cookie)
  const cookieValue =
    cookies.get(SESSION_COOKIE_NAME) ??
    cookies.get(`__Secure-${SESSION_COOKIE_NAME}`) ??
    cookies.get(`__Host-${SESSION_COOKIE_NAME}`)

  if (cookieValue) return cookieValue

  const authorization = req.headers.authorization || ""

  if (authorization.toLowerCase().startsWith("bearer ")) {
    const token = authorization.slice(7).trim()

    if (token) return token
  }

  return null
}

const hasValidSignature = (token, signature, secret) => {
  if (!secret) return true

  const expected = Buffer.from(
    createHmac("sha256", secret).update(token).digest("base64"),
  )
  const provided = Buffer.from(signature)

  return (
    provided.length === expected.length &&
    timingSafeEqual(provided, expected)
  )
}

const resolveSessionToken = (value) => {
  const separator = value.lastIndexOf(".")

  // A raw token (Bearer) has no signature to check.
  if (separator <= 0) return value

  const token = value.slice(0, separator)
  const signature = value.slice(separator + 1)

  return hasValidSignature(token, signature, AUTH_SECRET) ? token : null
}

// Protects the private API routes. Accepts the better-auth session from the
// browser cookie or from an `Authorization: Bearer <token>` header, validates
// it against the shared MongoDB session store, and attaches `req.user`.
const verifyAPI = async (req, res, next) => {
  try {
    const cookieOrToken = getSessionValue(req)

    if (!cookieOrToken) {
      res.status(401).send({ error: "Unauthorized. Please sign in." })
      return
    }

    const token = resolveSessionToken(cookieOrToken)

    if (!token) {
      res.status(401).send({ error: "Unauthorized. Please sign in." })
      return
    }

    const session = await sessionCollection.findOne({ token })

    if (!session?.expiresAt || new Date(session.expiresAt) <= new Date()) {
      res.status(401).send({ error: "Unauthorized. Please sign in." })
      return
    }

    const userId = ObjectId.isValid(session.userId)
      ? new ObjectId(session.userId)
      : session.userId
    const user = await userCollection.findOne({ _id: userId })

    if (!user) {
      res.status(401).send({ error: "Unauthorized. Please sign in." })
      return
    }

    req.user = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      image: user.image ?? null,
      emailVerified: user.emailVerified ?? false,
    }
    req.session = session

    next()
  } catch (error) {
    console.dir(error)
    res.status(500).send({ error: "Could not verify your session. Please try again." })
  }
}

const BOOK_CATEGORIES = ["Fiction", "Science", "History", "Kids", "Others"]

const readText = (value) => (typeof value === "string" ? value.trim() : "")

const isHttpUrl = (value) => {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

app.get("/", (req, res) => {
    res.send({message: "Server is running -,-!"})
})

app.post("/Add-Book", verifyAPI, async (req, res) => {
  const data = req.body ?? {}

  // Ownership always comes from the verified session, never from the body.
  const book = {
    ...data,
    userId: req.user.id,
    userName: req.user.name,
    userEmail: req.user.email,
    createdAt: new Date().toISOString(),
  }

  const result = await bookCollection.insertOne(book)

  console.log(result)
  res.send({ message: "Book added successfully.", insertedId: result.insertedId })
})

// GET /My-Books
// Returns only the books added by the signed-in user, newest first.
app.get("/My-Books", verifyAPI, async (req, res) => {
  try {
    const books = await bookCollection
      .find({ userEmail: req.user.email })
      .sort({ createdAt: -1 })
      .toArray()

    res.send(books)
  } catch (error) {
    console.dir(error)
    res.status(500).send({ error: "Could not load books. Please try again." })
  }
})

// DELETE /My-Books/:id
// Deletes a book, but only when it belongs to the signed-in user.
app.delete("/My-Books/:id", verifyAPI, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    res.status(400).send({ error: "Invalid book id." })
    return
  }

  try {
    const result = await bookCollection.deleteOne({
      _id: new ObjectId(req.params.id),
      userEmail: req.user.email,
    })

    if (result.deletedCount !== 1) {
      res.status(404).send({ error: "Book not found or does not belong to you." })
      return
    }

    // Drop borrow records that point at the deleted book.
    await db.collection("borrows").deleteMany({ bookId: req.params.id })

    res.send({ message: "Book deleted successfully." })
  } catch (error) {
    console.dir(error)
    res.status(500).send({ error: "Could not delete the book. Please try again." })
  }
})

// PUT /My-Books/:id
// Updates a book's editable fields, but only when it belongs to the signed-in
// user. userName, userEmail and createdAt are never changed.
app.put("/My-Books/:id", verifyAPI, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    res.status(400).send({ error: "Invalid book id." })
    return
  }

  const data = req.body ?? {}
  const title = readText(data.title)
  const author = readText(data.author)
  const category = readText(data.category)
  const imageUrl = readText(data.imageUrl)
  const description = readText(data.description)
  const copies = Number(data.copies)

  if (!title || !author || !category || !imageUrl || !description) {
    res.status(400).send({ error: "All book fields are required." })
    return
  }

  if (!BOOK_CATEGORIES.includes(category)) {
    res.status(400).send({ error: "Please choose a valid category." })
    return
  }

  if (!isHttpUrl(imageUrl)) {
    res.status(400).send({ error: "Please provide a valid image link." })
    return
  }

  if (!Number.isInteger(copies) || copies < 1) {
    res.status(400).send({ error: "Number of copies must be a whole number of at least 1." })
    return
  }

  try {
    const result = await bookCollection.updateOne(
      { _id: new ObjectId(req.params.id), userEmail: req.user.email },
      { $set: { title, author, category, imageUrl, description, copies } },
    )

    if (result.matchedCount !== 1) {
      res.status(404).send({ error: "Book is not found or does not belong to you." })
      return
    }

    const book = await bookCollection.findOne({ _id: new ObjectId(req.params.id) })

    res.send({ message: "Book updated successfully.", book })
  } catch (error) {
    console.dir(error)
    res.status(500).send({ error: "Could not update the book. Please try again." })
  }
})

// GET /All-Books
// Returns every book in the library, newest first.
app.get("/All-Books", async (req, res) => {
  try {
    const books = await bookCollection
      .find({})
      .sort({ createdAt: -1 })
      .toArray()

    res.send(books)
  } catch (error) {
    console.dir(error)
    res.status(500).send({ error: "Could not load books. Please try again." })
  }
})


// Returns a single book by its MongoDB id.
app.get("/All-Books/:id", verifyAPI, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    res.status(400).send({ error: "Invalid book id." })
    return
  }

  try {
    const book = await bookCollection.findOne({ _id: new ObjectId(req.params.id) })

    if (!book) {
      res.status(404).send({ error: "Book is not found." })
      return
    }

    res.send(book)
  } catch (error) {
    console.dir(error)
    res.status(500).send({ error: "Could not load the book. Please try again." })
  }
})

app.listen(PORT, () => {
    console.log(`Server is running at ${PORT }`)
})