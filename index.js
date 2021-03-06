const express = require('express')
const cors = require('cors');
const app = express()
require('dotenv').config()
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY)
const port = process.env.PORT || 5000

// Middleware
app.use(cors());
app.use(express.json());


const verifyJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'UnAuthorized Access' });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
        if (err) {
            return res.status(403).send({ message: 'Forbidden Access' })
        }
        req.decoded = decoded;
        next()
    });
}


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.17y6e.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverApi: ServerApiVersion.v1
});

async function run() {
    try {
        await client.connect();
        const servicesCollection = client.db("doctors-portal").collection("services");
        const bookingCollection = client.db("doctors-portal").collection("bookings");
        const userCollection = client.db("doctors-portal").collection("users");
        const doctorCollection = client.db("doctors-portal").collection("doctors");
        const paymentCollection = client.db("doctors-portal").collection("payments");
        console.log('Conected DB')


        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email
            const requesterAccount = await userCollection.findOne({ email: requester });
            if (requesterAccount.role === 'admin') {
                next()
            }
            else {
                res.status(403).send({ message: 'Forbidden Access' })
            }
        }

        // reate-payment-intent API
        app.post("/create-payment-intent", verifyJWT, async (req, res) => {
            const { price } = req.body;
            const amount = price * 100
            // Create a PaymentIntent with the order amount and currency
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                payment_method_types: ["card"],
            })
            res.send({ clientSecret: paymentIntent.client_secret });
        })


        app.get('/services', async (req, res) => {
            const query = {};
            const cursor = servicesCollection.find(query).project({ name: 1 });
            const services = await cursor.toArray();
            res.send(services)
        })
        app.put('/users/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            const requester = req.decoded.email
            const requesterAccount = await userCollection.findOne({ email: requester });
            if (requesterAccount.role === 'admin') {
                const filter = { email: email };
                const updateDoc = {
                    $set: { role: 'admin' }
                }
                const result = await userCollection.updateOne(filter, updateDoc);
                res.send(result)
            }
            else {
                res.status(403).send({ message: 'Forbidden' })
            }
        })
        app.get('/users', verifyJWT, async (req, res) => {
            const users = await userCollection.find().toArray();
            res.send(users)
        })



        // create user details for this api
        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: user
            };
            const result = await userCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN, {
                expiresIn: '1d',
            });
            res.send({ result, token })
        })

        //booking appointment api
        app.post('/bookings', async (req, res) => {
            const booking = req.body;
            const query = {
                treatment: booking.treatment,
                date: booking.date,
                patientEmail: booking.patientEmail
            }
            const exists = await bookingCollection.findOne(query);
            if (exists) {
                return res.send({ success: false, bookings: exists })
            }
            const result = await bookingCollection.insertOne(booking);
            res.send({ success: true, result: result })
        })

        // admin all user show api
        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const users = await userCollection.findOne({ email: email })
            const isAdmin = users.role === 'admin'
            res.send({ admin: isAdmin })
        })


        // booking API for dashboard my appointment
        app.get('/booking', verifyJWT, async (req, res) => {
            const patient = req.query.patient;
            const decodedEmail = req.decoded.email;
            if (patient === decodedEmail) {
                const query = { patientEmail: patient }
                const booking = await bookingCollection.find(query).toArray();
                return res.send(booking)
            }
            else {
                return res.status(403).send({ message: 'Forbidden Access' })
            }
        })

        // booking payment api
        app.get('/booking/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await bookingCollection.findOne(query)
            res.send(result);
        })

        //payment complete api
        app.patch('/booking/:id', verifyJWT, async (req, res) => {
            const id = req.params.id
            const payment = req.body;
            const filter = { _id: ObjectId(id) };
            const updateDoc = {
                $set: {
                    paid: true,
                    transactionId: payment.id,
                }
            }
            const result = await paymentCollection.insertOne(payment)
            const updatePayment = await bookingCollection.updateOne(filter, updateDoc)
            res.send(updateDoc)

        })


        app.get('/available', async (req, res) => {
            const date = req.query.date

            // step 1: Get all Services
            const services = await servicesCollection.find().toArray();

            // step 2: get the booking of the day
            const query = { date: date };
            const bookings = await bookingCollection.find(query).toArray()

            // step 3: forEach service
            services.forEach(service => {
                // step 4: find booking for that service
                const serviceBookings = bookings.filter(booking => booking.treatment === service.name);
                // step 5: select slots for the bookings
                const bookedSlots = serviceBookings.map(bookingSlot => bookingSlot.slot);
                // step 6: select those slots that are not in bookedSlots
                const available = service.slots.filter(slots => !bookedSlots.includes(slots))
                service.slots = available;
            })


            res.send(services)
        })

        //get all doctors API
        app.get('/doctors', verifyJWT, verifyAdmin, async (req, res) => {
            const doctors = await doctorCollection.find().toArray()
            res.send(doctors)
        })

        // doctor api for dashboard
        app.post('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
            const doctor = req.body;
            const result = await doctorCollection.insertOne(doctor);
            res.send(result);
        })

        // doctor delete API
        app.delete('/doctor/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const query = { email: email }
            const result = await doctorCollection.deleteOne(query)
            res.send(result);
        })

    } finally {

    }
}
run().catch(console.dir)


app.get('/', (req, res) => {
    res.send('Doctors Portal')
})

app.listen(port, () => {
    console.log(`Doctors Portal on port ${port}`)
})