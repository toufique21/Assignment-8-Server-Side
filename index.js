import express from "express"
import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config'
import cors from "cors"

const app = express()
const PORT = 8000

app.use(cors())
app.use(express.json())

//http://localhost:8000/Add-Book


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
    res.status(400).send({ error: "An email query parameter is required." })
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

// GET /All-Books/:id
// Returns a single book by its MongoDB id.
app.get("/All-Books/:id", async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    res.status(400).send({ error: "Invalid book id." })
    return
  }

  try {
    const book = await bookCollection.findOne({ _id: new ObjectId(req.params.id) })

    if (!book) {
      res.status(404).send({ error: "Book not found." })
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