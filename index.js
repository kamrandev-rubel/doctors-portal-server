const express = require('express')
const cors = require('cors');
const app = express()
const jwt = require('jsonwebtoken');
require('dotenv').config()
const { MongoClient, ServerApiVersion } = require('mongodb');
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
        console.log('Conected DB')

        app.get('/services', async (req, res) => {
            const query = {};
            const cursor = servicesCollection.find(query);
            const services = await cursor.toArray();
            res.send(services)
        })

        app.get('/users', async (req, res) => {
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
                expiresIn: '1h',
            });
            res.send({ result, token })
        })


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