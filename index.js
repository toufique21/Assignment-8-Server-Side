import express from "express"
import { MongoClient } from 'mongodb';
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

app.listen(PORT, () => {
    console.log(`Server is running at ${PORT }`)
})