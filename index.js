const express = require('express');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();

console.log('Checking for public/index.html...');
const indexPath = path.join(__dirname, 'public', 'index.html');
fs.access(indexPath, fs.constants.F_OK, (err) => {
  if (err) {
    console.error('public/index.html does not exist:', err);
  } else {
    console.log('public/index.html exists at:', indexPath);
  }
});

app.use(cors());
app.use(express.json());

// Serve static files
app.use(express.static('public'));

// Initialize Firebase
let serviceAccount;
try {
  serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
  console.log('FIREBASE_CREDENTIALS parsed successfully. Project ID:', serviceAccount.project_id);
} catch (error) {
  console.error('Failed to parse FIREBASE_CREDENTIALS:', error);
  throw new Error('Invalid FIREBASE_CREDENTIALS environment variable');
}

try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log('Firebase Admin SDK initialized successfully');
} catch (error) {
  console.error('Failed to initialize Firebase Admin SDK:', error);
  throw new Error('Firebase initialization failed');
}

const db = admin.firestore();

// Configure email sending via Gmail
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'anhnt2433@gmail.com', // Replace with your email
    pass: 'esiz prud gjta aokm' // Replace with your App Password
  }
});

// Get inventory data
app.get('/inventory', async (req, res) => {
  try {
    console.log('Fetching inventory data...');
    const snapshot = await db.collection('inventory').doc('main').get();
    console.log('Snapshot exists:', snapshot.exists);
    if (!snapshot.exists) {
      console.log('No inventory data found, returning default table');
      return res.json([['ID', 'Product Name', 'Product Code', 'Serial Number', 'Unit', 'Quantity', 'Note', 'Destroyed']]);
    }
    const data = snapshot.data().data;
    console.log('Inventory data:', data);
    res.json(data);
  } catch (error) {
    console.error('Error in /inventory:', error);
    res.status(500).json({ error: error.message });
  }
});

// Save inventory data
app.post('/inventory', async (req, res) => {
  try {
    const data = req.body;
    await db.collection('inventory').doc('main').set({ data });
    res.json({ message: 'Data saved successfully!' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Import inventory
app.post('/import', async (req, res) => {
  try {
    const { productName, quantity, note } = req.body;
    const snapshot = await db.collection('inventory').doc('main').get();
    let data = snapshot.exists ? snapshot.data().data : [['ID', 'Product Name', 'Product Code', 'Serial Number', 'Unit', 'Quantity', 'Note', 'Destroyed']];

    let found = false;
    for (let i = 1; i < data.length; i++) {
      if (data[i][1] === productName) {
        data[i][5] = parseFloat(data[i][5] || 0) + parseFloat(quantity);
        found = true;
        break;
      }
    }
    if (!found) {
      data.push([data.length, productName, '', '', '', parseFloat(quantity), note, '']);
    }

    await db.collection('inventory').doc('main').set({ data });
    await db.collection('importHistory').add({
      date: new Date().toISOString(),
      productName,
      quantity,
      note
    });

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Export inventory
app.post('/export', async (req, res) => {
  try {
    const { productName, quantity, note } = req.body;
    const snapshot = await db.collection('inventory').doc('main').get();
    let data = snapshot.exists ? snapshot.data().data : [['ID', 'Product Name', 'Product Code', 'Serial Number', 'Unit', 'Quantity', 'Note', 'Destroyed']];

    let found = false;
    for (let i = 1; i < data.length; i++) {
      if (data[i][1] === productName) {
        let currentQuantity = parseFloat(data[i][5] || 0);
        let newQuantity = currentQuantity - parseFloat(quantity);
        if (newQuantity < 0) throw new Error('Export quantity exceeds available stock!');
        data[i][5] = newQuantity;
        found = true;
        break;
      }
    }
    if (!found) throw new Error('Product not found!');

    await db.collection('inventory').doc('main').set({ data });
    await db.collection('exportHistory').add({
      date: new Date().toISOString(),
      productName,
      quantity,
      note
    });

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Check and send alerts
app.post('/alert', async (req, res) => {
  try {
    const data = req.body;
    let alerts = [];
    for (let i = 1; i < data.length; i++) {
      let productName = data[i][1];
      let quantity = parseFloat(data[i][5]);
      if (isNaN(quantity)) continue;
      if (quantity < 10) {
        alerts.push(`Product ${productName} has only ${quantity} units left!`);
        await transporter.sendMail({
          from: 'your-email@gmail.com',
          to: 'email_cua_ban@gmail.com',
          subject: 'Inventory Alert',
          text: `Product ${productName} has only ${quantity} units left!`
        });
      }
    }
    res.json(alerts.length > 0 ? alerts : ['No products below threshold!']);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Favicon routes
app.get('/favicon.ico', (req, res) => res.status(204).end());
app.get('/favicon.png', (req, res) => res.status(204).end());

app.listen(process.env.PORT || 3000, () => console.log('Server running'));
