import express from "express"
import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config'
import cors from "cors"

const app = express()
const PORT = 8000

app.use(cors())
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

app.post("/Add-Book", async (req, res) => {
  const data = req.body

  const result = await bookCollection.insertOne(data)

  console.log(result);
  res.send({message: "API Working..."})
})

// GET /My-Books?email=user@example.com
// Returns only the books added by that user, newest first.
app.get("/My-Books", async (req, res) => {
  const email = typeof req.query.email === "string" ? req.query.email.trim() : ""

  if (!email) {
    res.status(400).send({ error: "Email query parameter is required." })
    return
  }

  try {
    const books = await bookCollection
      .find({ userEmail: email })
      .sort({ createdAt: -1 })
      .toArray()

    res.send(books)
  } catch (error) {
    console.dir(error)
    res.status(500).send({ error: "Could not load books. Please try again." })
  }
})

// DELETE /My-Books/:id?email=user@example.com
// Deletes a book, but only when it belongs to the given user.
app.delete("/My-Books/:id", async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    res.status(400).send({ error: "Invalid book id." })
    return
  }

  const email = typeof req.query.email === "string" ? req.query.email.trim() : ""

  if (!email) {
    res.status(400).send({ error: "Email query parameter is required." })
    return
  }

  try {
    const result = await bookCollection.deleteOne({
      _id: new ObjectId(req.params.id),
      userEmail: email,
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

// PUT /My-Books/:id?email=user@example.com
// Updates a book's editable fields, but only when it belongs to the given user.
// userName, userEmail and createdAt are never changed.
app.put("/My-Books/:id", async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    res.status(400).send({ error: "Invalid book id." })
    return
  }

  const email = typeof req.query.email === "string" ? req.query.email.trim() : ""

  if (!email) {
    res.status(400).send({ error: "Email query parameter is required." })
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
      { _id: new ObjectId(req.params.id), userEmail: email },
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
app.get("/All-Books/:id", async (req, res) => {
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