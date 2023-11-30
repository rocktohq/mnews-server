const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const cors = require("cors");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET);

const port = process.env.PORT || 5000;
const app = express();

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://m-newshq.web.app",
      "https://m-newshq.firebaseapp.com",
    ],
    credentials: true,
  })
);

// * Default Route
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
    const paymentCollection = client.db("mNews").collection("payments");

    // * JWT Related APIs
    // JWT API
    app.post("/api/jwt", (req, res) => {
      try {
        const user = req.body;
        const token = jwt.sign(user, process.env.JWT_SECRET, {
          expiresIn: "24h",
        });

        res
          .cookie("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
            maxAge: 1000 * 60 * 60 * 24,
          })
          .send({ Action: "Token form Local", success: true, token });
      } catch (err) {
        res.send(err);
      }
    });

    // LogOut API
    app.post("/api/logout", (req, res) => {
      try {
        const user = req.body;
        res
          .clearCookie("token", { maxAge: 0 })
          .send({ Action: "Logout user", success: true });
      } catch (err) {
        res.send(err);
      }
    });

    // Token Verification
    const verifyToken = (req, res, next) => {
      const token = req?.cookies?.token;
      if (!token)
        return res.status(401).send({ message: "Unauthorized access" });
      jwt.verify(token, process.env.JWT_SECRET, (error, decoded) => {
        if (error)
          return res.status(401).send({ message: "Unauthorized access" });
        req.user = decoded;
        next();
      });
    };

    // Admin Verification
    const verifyAdmin = async (req, res, next) => {
      const email = req.user.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "Forbidden access" });
      }
      next();
    };

    // * Get APIs
    // * Get All Users [ADMIN ONLY]
    app.get("/api/admin/users", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const page = parseInt(req.query.page);
        const size = parseInt(req.query.size);
        const userCount = await articleCollection.countDocuments();

        const result = await userCollection
          .find()
          .skip(page * size)
          .limit(size)
          .toArray();
        res.send({ users: result, userCount });
      } catch (err) {
        res.send(err);
      }
    });

    // * Get Single User [ADMIN]
    app.get("/api/users/:email", async (req, res) => {
      try {
        const query = { email: req.params.email };
        const result = await userCollection.findOne(query);
        res.send(result);
      } catch (err) {
        res.send(err);
      }
    });

    // Check Admin [LOGGEDIN USER]
    app.get("/api/users/admin/:email", verifyToken, async (req, res) => {
      try {
        const email = req.params.email;

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

    // Check Premium [LOGGEDIN USER]
    app.get("/api/users/premium/:email", verifyToken, async (req, res) => {
      try {
        const email = req.params.email;

        const query = { email: email };
        const user = await userCollection.findOne(query);
        let premium = false;
        if (user) {
          premium = user?.isPremium === true;
        }
        res.send({ premium });
      } catch (err) {
        res.send(err);
      }
    });

    // Get Trending Articles [PUBLIC]
    app.get("/api/trending-articles", async (req, res) => {
      try {
        const sort = { views: -1 };
        const query = { status: "published" };
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

    // * Get All Articles [ADMIN ONLY]
    app.get(
      "/api/admin/articles",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const page = parseInt(req.query.page);
          const size = parseInt(req.query.size);
          const articleCount = await articleCollection.countDocuments();
          const result = await articleCollection
            .find()
            .skip(page * size)
            .limit(size)
            .toArray();
          res.send({ articles: result, articleCount });
        } catch (err) {
          res.send(err);
        }
      }
    );

    // Get All Published Articles [PUBLIC]
    app.get("/api/articles", async (req, res) => {
      try {
        const page = Number(req.query.offset);
        const limit = Number(req.query.limit);
        const skip = page * limit;
        const search = req.query.search;
        const publisher = req.query.publisher;
        const tag = req.query.tag;

        let query = { status: "published" };
        if (publisher) {
          query = {
            "publisher.name": { $regex: publisher, $options: "i" },
            status: "published",
          };
        }
        if (tag) {
          query = {
            tags: { $in: [tag] },
            status: "published",
          };
        }
        if (search) {
          query = {
            title: { $regex: search, $options: "i" },
            status: "published",
          };
        }
        const articles = await articleCollection
          .find(query)
          .skip(skip)
          .limit(limit)
          .toArray();

        const articlesCount = await articleCollection.countDocuments(query);

        res.send({ articles, articlesCount });
      } catch (err) {
        res.send(err);
      }
    });

    // Get All Published Premium Articles [LOGGEDIN USER => PREMIUM USER]
    app.get("/api/premium-articles", verifyToken, async (req, res) => {
      try {
        // console.log(req.user.email);
        // const user = await userCollection.findOne({ email: req.user.email });
        // if (!user?.isPremium || user?.role !== "admin") {
        //   return res.status(403).send("Forbidden access");
        // }

        const page = Number(req.query.offset);
        const limit = Number(req.query.limit);
        const skip = page * limit;

        const articles = await articleCollection
          .find({ status: "published", isPremium: true })
          .skip(skip)
          .limit(limit)
          .toArray();

        // articlesCount
        const articlesCount = await articleCollection.countDocuments({
          status: "published",
          isPremium: true,
        });

        res.send({ articles, articlesCount });
      } catch (err) {
        res.send(err);
      }
    });

    // Get Single Article
    app.get("/api/articles/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id), status: "published" };
        const result = await articleCollection.findOne(query);
        res.send(result);
      } catch (err) {
        res.send(err);
      }
    });

    // Get Single Article [OWNER]
    app.get("/api/articles/owner/:id", verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await articleCollection.findOne(query);

        if (result?.author.email !== req.user.email) {
          return res.status(403).send("Forbidden access");
        }
        res.send(result);
      } catch (err) {
        res.send(err);
      }
    });

    // Get User Articles
    app.get("/api/my-articles", verifyToken, async (req, res) => {
      try {
        if (req.user.email !== req.query.email) {
          return res.status(403).send("Forbidden access");
        }

        const result = await articleCollection
          .find({ "author.email": req.query.email })
          .toArray();
        res.send(result);
      } catch (err) {
        res.send(err);
      }
    });

    // Get Publishers [PUBLIC]
    app.get("/api/publishers", async (req, res) => {
      try {
        const publishers = await publisherCollection.find().toArray();
        res.send(publishers);
      } catch (err) {
        res.send(err);
      }
    });

    // Get Tags [PUBLIC]
    app.get("/api/tags", async (req, res) => {
      try {
        const tags = await tagCollection.find().toArray();
        res.send(tags);
      } catch (err) {
        res.send(err);
      }
    });

    // Get Reviews [PUBLIC]
    app.get("/api/reviews", async (req, res) => {
      try {
        const reviews = await reviewCollection.find().toArray();
        res.send(reviews);
      } catch (err) {
        res.send(err);
      }
    });

    // * Get Admin Stats
    app.get("/api/admin/stats", verifyToken, async (req, res) => {
      try {
        const stats = await publisherCollection
          .aggregate([
            {
              $lookup: {
                from: "articles",
                localField: "name",
                foreignField: "publisher.name",
                as: "articles",
              },
            },
            {
              $group: {
                _id: "$_id",
                publisherName: { $first: "$name" },
                articleCount: { $sum: { $size: "$articles" } },
              },
            },
            {
              $project: {
                _id: 0,
                name: "$publisherName",
                count: "$articleCount",
              },
            },
          ])
          .toArray();

        const data = [["Publisher", "Articles"]];
        stats.map((stat) => data.push([stat.name, stat.count]));

        res.send(data);
      } catch (error) {
        res.send(error);
      }
    });

    // User Counter
    app.get("/api/user-stats", async (req, res) => {
      try {
        const allUsers = await userCollection.countDocuments();
        const normalUsers = await userCollection.countDocuments({
          isPremium: false,
        });
        const premiumUsers = await userCollection.countDocuments({
          isPremium: true,
        });

        res.send({
          stats: [
            ["Users", "Count"],
            ["Total Users", allUsers],
            ["Normal Users", normalUsers],
            ["Premium Users", premiumUsers],
          ],
          count: { allUsers, normalUsers, premiumUsers },
        });
      } catch (error) {
        res.send(error);
      }
    });

    // * Post APIs
    // Post User [AFTER LOGGEDIN/PUBLIC]
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

    // * Post Publisher [ADMIN ONLY]
    app.post("/api/publishers", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const publisher = req.body;
        const result = await publisherCollection.insertOne(publisher);
        res.send(result);
      } catch (error) {
        res.send(error);
      }
    });

    // Post Article [LOGGEDIN USER]
    app.post("/api/articles", verifyToken, async (req, res) => {
      try {
        const article = req.body;
        const result = await articleCollection.insertOne(article);
        res.send(result);
      } catch (error) {
        res.send(error);
      }
    });

    // * Update APIs
    // * Update User [ADMIN / USER]
    app.put("/api/users/:email", verifyToken, async (req, res) => {
      try {
        if (req.user.email !== req.params.email) {
          return res.status(403).send("Forbidden access");
        }

        const user = req.body;
        const query = {
          email: req.params.email,
        };
        const updatedUser = {
          $set: {
            ...user,
          },
        };
        const result = await userCollection.updateOne(query, updatedUser);
        res.send(result);
      } catch (error) {
        res.send(error);
      }
    });

    // * Make Admin
    app.put(
      "/api/admin/users/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const user = req.body;
          const query = {
            _id: new ObjectId(req.params.id),
          };
          const updatedUser = {
            $set: {
              ...user,
            },
          };
          const result = await userCollection.updateOne(query, updatedUser);
          res.send(result);
        } catch (error) {
          res.send(error);
        }
      }
    );

    // * Update Article [ADMIN ONLY]
    app.put(
      "/api/admin/articles/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const article = req.body;
          const query = { _id: new ObjectId(req.params.id) };
          const updatedArticle = {
            $set: {
              ...article,
            },
          };

          const result = await articleCollection.updateOne(
            query,
            updatedArticle
          );
          res.send(result);
        } catch (error) {
          res.send(error);
        }
      }
    );

    // Update Article [ARTICLE OWNER]
    app.put("/api/articles/:id", verifyToken, async (req, res) => {
      try {
        if (req.user.email !== req.query.email) {
          return res.status(403).send("Forbidden access");
        }

        const article = req.body;
        const options = {};
        const query = {
          _id: new ObjectId(req.params.id),
          "author.email": req.query.email,
        };
        const updatedArticle = {
          $set: {
            ...article,
          },
        };
        const result = await articleCollection.updateOne(
          query,
          updatedArticle,
          options
        );
        res.send(result);
      } catch (error) {
        res.send(error);
      }
    });

    // Update Article Views
    app.put("/api/articles/counter/:id", async (req, res) => {
      try {
        const views = req.body;
        const query = {
          _id: new ObjectId(req.params.id),
        };
        const options = {};
        const updatedArticle = {
          $set: {
            ...views,
          },
        };

        const result = await articleCollection.updateOne(
          query,
          updatedArticle,
          options
        );
        res.send(result);
      } catch (error) {
        res.send(error);
      }
    });

    // * Update Publisher [ADMIN ONLY]
    app.put("/api/publishers", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const publisher = req.body;
        const query = {
          _id: new ObjectId(req.params.id),
        };
        const updatedPublisher = {
          $set: {
            ...publisher,
          },
        };
        const result = await publisherCollection.updateOne(
          query,
          updatedPublisher
        );
        res.send(result);
      } catch (error) {
        res.send(error);
      }
    });

    // * Delete APIs
    // Delete Article
    app.delete("/api/articles/:id", verifyToken, async (req, res) => {
      try {
        if (req.user.email !== req.query.email) {
          return res.status(403).send("Forbidden access");
        }
        const result = await articleCollection.deleteOne({
          _id: new ObjectId(req.params.id),
        });
        res.send(result);
      } catch (error) {
        res.send(error);
      }
    });

    // Delete Article
    app.delete(
      "/api/admin/articles/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const result = await articleCollection.deleteOne({
            _id: new ObjectId(req.params.id),
          });
          res.send(result);
        } catch (error) {
          res.send(error);
        }
      }
    );

    // * Delete Publisher
    app.delete(
      "/api/publishers/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const result = await publisherCollection.deleteOne({
            _id: new ObjectId(req.params.id),
          });
          res.send(result);
        } catch (error) {
          res.send(error);
        }
      }
    );

    // * Payment Related APIs
    // Post Payment Information
    app.post("/api/payments", verifyToken, async (req, res) => {
      const payment = req.body;
      const existsPayment = await paymentCollection.findOne({
        email: payment.email,
      });
      if (existsPayment) {
        const updatedPayment = {
          $set: {
            ...payment,
          },
        };
        const result = await paymentCollection.updateOne(
          { email: payment.email },
          updatedPayment
        );
        return res.send(result);
      }
      const result = await paymentCollection.insertOne(payment);

      res.send(result);
    });

    // Get Payment Information
    app.get("/api/payments/:email", verifyToken, async (req, res) => {
      const query = { email: req.params.email };
      if (req.params.email !== req.user.email) {
        return res.status(403).send({ message: "Forbidden access" });
      }
      const result = await paymentCollection.findOne(query);
      res.send(result);
    });

    // Create Payment Intent
    app.post("/api/create-payment-intent", verifyToken, async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    // Update Payment
    app.put("/api/payments", verifyToken, async (req, res) => {
      try {
        const payment = req.body;
        await paymentCollection.deleteOne({
          email: payment.email,
        });

        // Change User Status
        const updatedUser = {
          $set: {
            isPremium: payment.isPremium,
            startTime: payment.startTime,
            duration: payment.duration,
          },
        };
        const result = await userCollection.updateOne(
          { email: payment.email },
          updatedUser
        );
        res.send(result);
      } catch (error) {
        res.send(error);
      }
    });

    // Remove Premium
    app.put("/api/remove-premium/:email", verifyToken, async (req, res) => {
      if (req.params.email !== req.user.email) {
        return res.status(403).send({ message: "Forbidden access" });
      }

      try {
        const email = req.params.email;
        const user = req.body;
        const query = { email };
        const updatedUser = {
          $set: {
            ...user,
          },
        };
        const result = await userCollection.updateOne(query, updatedUser);
        res.send(result);
      } catch (error) {
        res.send(error);
      }
    });

    // await client.db("admin").command({ ping: 1 });
    // console.log("You successfully connected to MongoDB!");
  } finally {
  }
}
run().catch(console.dir);

// Listener
app.listen(port, () => {
  console.log("mNews Server is running on port " + port);
});
