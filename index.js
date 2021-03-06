const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

// connect with mongodb
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.dncgj.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

const verificationJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "Unauthorized Access" });
  }
  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "Forbidden Access" });
    }
    req.decoded = decoded;
    next();
  });
};

async function run() {
  try {
    await client.connect();
    const productCollection = client.db("tooltrex").collection("products");
    const orderCollection = client.db("tooltrex").collection("orders");
    const userCollection = client.db("tooltrex").collection("users");
    const reviewCollection = client.db("tooltrex").collection("review");
    const paymentCollection = client.db("tooltrex").collection("payments");

    // create verifyAdmin function to checking user is admin or not
    const verifyAdmin = async (req, res, next) => {
      const requester = req.decoded.email;
      const requesterAccount = await userCollection.findOne({
        email: requester,
      });
      if (requesterAccount.role === "admin") {
        next();
      } else {
        res.status(403).send({ message: "Forbidden" });
      }
    };

    // create api for payment
    app.post("/create-payment-intent", verificationJWT, async (req, res) => {
      const order = req.body;
      const price = order.orderPrice;
      const amount = price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({ clientSecret: paymentIntent.client_secret });
    });

    // create api for loaded all products
    app.get("/products", async (req, res) => {
      const query = {};
      const cursor = productCollection.find(query);
      const products = await cursor.toArray();
      res.send(products);
    });

    // create api for loaded all users
    app.get("/user", verificationJWT, async (req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users);
    });

    // create api for loaded single product
    app.get("/products/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const product = await productCollection.findOne(query);
      res.send(product);
    });

    // create api for load orders for per user
    app.get("/order", verificationJWT, async (req, res) => {
      const customerEmail = req.query.customerEmail;
      const decodedEmail = req.decoded.email;
      if (customerEmail === decodedEmail) {
        const query = { customerEmail: customerEmail };
        const orders = await orderCollection.find(query).toArray();
        res.send(orders);
      } else {
        return res.status(403).send({ message: "Forbidden Access" });
      }
    });

    // create api for loaded a single order to payment
    app.get("/order/:id", verificationJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const order = await orderCollection.findOne(query);
      res.send(order);
    });

    // create api for insert order from user to database
    app.post("/order", async (req, res) => {
      const order = req.body;
      const result = await orderCollection.insertOne(order);
      res.send(result);
    });

    // create api for check admin
    app.get("/admin/:email", async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email: email });
      const isAdmin = user.role === "admin";
      res.send({ admin: isAdmin });
    });

    // create api for store all users on userCollection
    app.put("/user/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await userCollection.updateOne(filter, updateDoc, options);
      const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN, {
        expiresIn: "1h",
      });
      res.send({ result, token });
    });

    // create api for set admin role
    app.put(
      "/user/admin/:email",
      verificationJWT,
      verifyAdmin,
      async (req, res) => {
        const email = req.params.email;
        const filter = { email: email };
        const updateDoc = {
          $set: { role: "admin" },
        };
        const result = await userCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
    );

    // create api for add a product from dashboard
    app.post("/products", verificationJWT, verifyAdmin, async (req, res) => {
      const product = req.body;
      const result = await productCollection.insertOne(product);
      res.send(result);
    });

    // create api for delete product from manage product
    app.delete(
      "/products/:id",
      verificationJWT,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: ObjectId(id) };
        const result = await productCollection.deleteOne(filter);
        res.send(result);
      }
    );

    // create api for delete order from My Order
    app.delete("/orders/:id", verificationJWT, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const result = await orderCollection.deleteOne(filter);
      res.send(result);
    });

    // create api for show review
    app.get("/review", async (req, res) => {
      const query = {};
      const reviews = await reviewCollection.find(query).toArray();
      res.send(reviews);
    });

    // add a review | Post review
    app.post("/review", async (req, res) => {
      const review = req.body;
      const result = await reviewCollection.insertOne(review);
      res.send(result);
    });

    // create api for loaded all orders on admin dashboard
    app.get("/orders", verificationJWT, verifyAdmin, async (req, res) => {
      const query = {};
      const cursor = orderCollection.find(query);
      const orders = await cursor.toArray();
      res.send(orders);
    });

    // create api for delete orders from manage all orders route
    app.delete(
      "/orders/:id",
      verificationJWT,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: ObjectId(id) };
        const result = await orderCollection.deleteOne(filter);
        res.send(result);
      }
    );

    // create api for delete order from user dashboard
    app.delete("/order/:id", verificationJWT, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const order = await orderCollection.findOne(filter);
      const result = await orderCollection.deleteOne(filter);
      console.log(order);
      const product = await productCollection.findOne({
        _id: ObjectId(order.orderProduct),
      });
      const newProduct = await productCollection.updateOne(
        { _id: ObjectId(order.orderProduct) },
        {
          $set: {
            available_quantity:
              parseInt(product.available_quantity) +
              parseInt(order.orderQuantity),
          },
        }
      );
      res.send(result);
    });

    // create api for update quantity
    app.patch("/products/:id", verificationJWT, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const product = req.body;
      const updateDoc = {
        $set: {
          available_quantity: product.available_quantity,
        },
      };
      const result = await productCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // create api for payment store on database and convert pay button to paid
    app.patch("/order/:id", verificationJWT, async (req, res) => {
      const id = req.params.id;
      const payment = req.body;
      const filter = { _id: ObjectId(id) };
      const updateDoc = {
        $set: {
          paid: true,
          transactionId: payment.transactionId,
        },
      };

      const updatedOrder = await orderCollection.updateOne(filter, updateDoc);
      const result = await paymentCollection.insertOne(payment);
      res.send(updateDoc);
    });

    //single users info
    app.get("/userInfo/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      res.send(user);
    });
  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello Tooltrex!");
});

app.listen(port, () => {
  console.log(`Tooltrex app  on server is running ${port}`);
});
