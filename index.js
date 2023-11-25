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
    const userCollection = client.db("mNews").collection("users");

    // * Get APIs
    // Get All Users
    app.get("/api/users", async (req, res) => {
      try {
        const result = await userCollection.find().toArray();
        res.send(result);
      } catch (err) {
        res.send(err);
      }
    });

    // Check Admin
    app.get("/api/users/admin/:email", async (req, res) => {
      try {
        const email = req.params.email;

        if (email !== req.decoded.email) {
          return res.status(403).send({ message: "forbidden access" });
        }

        const query = { email: email };
        const user = await userCollection.findOne(query);
        let admin = false;
        if (user) {
          admin = user?.role === "admin";
        }
        res.send({ admin });
      } catch (err) {
        res.send(err);
      }
    });

    // Get Trending Articles
    app.get("/api/trending-articles", async (req, res) => {
      try {
        const sort = { views: -1 };
        const query = { isPublished: true };
        const limit = 6;

        const articles = await articleCollection
          .find(query)
          .sort(sort)
          .limit(limit)
          .toArray();
        res.send(articles);
      } catch (err) {
        res.send(err);
      }
    });

    // Get Publishers
    app.get("/api/publishers", async (req, res) => {
      try {
        const publishers = await publisherCollection.find().toArray();
        res.send(publishers);
      } catch (err) {
        res.send(err);
      }
    });

    // Get Tags
    app.get("/api/tags", async (req, res) => {
      try {
        const tags = await tagCollection.find().toArray();
        res.send(tags);
      } catch (err) {
        res.send(err);
      }
    });

    // Get Reviews
    app.get("/api/reviews", async (req, res) => {
      try {
        const reviews = await reviewCollection.find().toArray();
        res.send(reviews);
      } catch (err) {
        res.send(err);
      }
    });

    // * Post APIs
    // Post User
    app.post("/api/users", async (req, res) => {
      try {
        const user = req.body;
        // Check if user is exits
        const query = { email: user.email };
        const existingUser = await userCollection.findOne(query);
        if (existingUser) {
          return res.send({
            message: "User already exists!",
            insertedId: null,
          });
        }
        const result = await userCollection.insertOne(user);
        res.send(result);
      } catch (error) {
        res.send(error);
      }
    });

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
