const express = require("express");
const cors = require("cors");
const port = process.env.PORT || 5000;

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

app.get("/", (req, res) => {
  res.send("mNews Server is running...");
});

// Listener
app.listen(port, () => {
  console.log("mNews Server is running on port " + port);
});
