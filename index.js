const express = require("express");
const { MongoClient, ServerApiVersion } = require("mongodb");
const cors = require("cors");
require("dotenv").config();
const port = process.env.PORT || 5000;

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

app.get("/", (req, res) => {
  res.send("mNews Server is running...");
});

// MongoDB URI
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@usermanagement.n4peacj.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // * Collections
    const articleCollection = client.db("mNews").collection("articles");
    const publisherCollection = client.db("mNews").collection("publishers");
    const tagCollection = client.db("mNews").collection("tags");
    const reviewCollection = client.db("mNews").collection("reviews");

    // * Get APIs
    // Get Trending Articles
    try {
      app.get("/api/trending-articles", async (req, res) => {
        const sort = { views: -1 };
        const query = { isPublished: true };
        const limit = 6;

        const articles = await articleCollection
          .find(query)
          .sort(sort)
          .limit(limit)
          .toArray();
        res.send(articles);
      });
    } catch (err) {
      res.send(err);
    }

    // Get Publishers
    try {
      app.get("/api/publishers", async (req, res) => {
        const publishers = await publisherCollection.find().toArray();
        res.send(publishers);
      });
    } catch (err) {
      res.send(err);
    }

   

    await client.db("admin").command({ ping: 1 });
    console.log("You successfully connected to MongoDB!");
  } finally {
  }
}
run().catch(console.dir);

// Listener
app.listen(port, () => {
  console.log("mNews Server is running on port " + port);
});
