const express = require('express')
const cors = require('cors');
const app = express()
require('dotenv').config()
const { MongoClient, ServerApiVersion } = require('mongodb');
const port = process.env.PORT || 5000

// Middleware
app.use(cors());
app.use(express.json());


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
        console.log('Conected DB')

        app.get('/services', async (req, res) => {
            const query = {};
            const cursor = servicesCollection.find(query);
            const services = await cursor.toArray();
            res.send(services)
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


        // booking API for dashboard
        app.get('/booking', async (req, res) => {
            const patient = req.query.patient;
            const query = { patientEmail: patient }
            const booking = await bookingCollection.find(query).toArray();
            res.send(booking)
        })

        app.get('/available', async (req, res) => {
            const date = req.query.date

            // step 1: Get all Services
            const services = await servicesCollection.find().toArray();

            // step 2: get the booking of the day
            const query = { date: date };
            const bookings = await bookingCollection.find(query).toArray()
            console.log(bookings)

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