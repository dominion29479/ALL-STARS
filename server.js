require("dotenv").config();
const cors = require("cors");
const express = require('express');
const axios = require('axios');
const morgan = require('morgan');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const secretKey = process.env.PAYSTACK_SECRET_KEY;
const publicKey = process.env.PAYSTACK_PUBLIC_KEY;
const PORT = process.env.PORT || 3000;

// Validate Paystack credentials
if (!secretKey || !publicKey) {
  console.warn('WARNING: Paystack credentials are not properly configured. Please ensure PAYSTACK_SECRET_KEY and PAYSTACK_PUBLIC_KEY are set in your .env file.');
  if (!secretKey) console.warn('Missing PAYSTACK_SECRET_KEY');
  if (!publicKey) console.warn('Missing PAYSTACK_PUBLIC_KEY');
}

// Enhanced CORS configuration to support Paystack and other external API calls
const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));
const DB_PATH = path.join(__dirname, 'database.sqlite');
const LEGACY_DATA_FILE = path.join(__dirname, 'orders.json');

const defaultProducts = [
  { id: 1, name: 'HDMI VIDEO SWITCH 4K (FJGEAR)', price: 450000, image: 'images/hdmi.jpg', description: 'High-performance laptop for work, study, and gaming.' },
  { id: 2, name: 'TYPE-C TO HDTV', price: 250000, image: 'images/T.jpeg', description: 'Connect your usb-c computer to HDTV equipped display.' },
  { id: 3, name: 'WIRELESS DUAL BAND USB ADAPTER (LB-LINK)', price: 35000, image: 'images/S.jpeg', description: 'Wireless adaptar provides the greater throughput performance, more stable network connection and higher compactibility for wireless adapters, Greatly enhance the reception and transmission signal strenght.' },
  { id: 4, name: 'Sport Headphones (X2pro)', price: 60000, image: 'images/headphones.jpeg', description: 'Good sound quality exprience, detachable design, in ear headphones, intelligent wire control.' }
];

const PRODUCTS_FILE = path.join(__dirname, 'products.json');
let products = defaultProducts.slice();

const saveProducts = () => {
  try {
    fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save products file', err.message);
  }
};

const createSalt = () => crypto.randomBytes(16).toString('hex');
const hashPassword = (password, salt) => crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
const createToken = () => crypto.randomBytes(24).toString('hex');

const loadProducts = () => {
  if (fs.existsSync(PRODUCTS_FILE)) {
    try {
      const raw = fs.readFileSync(PRODUCTS_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        products = parsed;
        return;
      }
    } catch (err) {
      console.error('Failed to load products file', err.message);
    }
  }
  saveProducts();
};

const nextProductId = () => products.reduce((maxId, product) => Math.max(maxId, product.id || 0), 0) + 1;

const getEstimatedDeliveryDate = (shipping, createdAt) => {
  const baseDate = createdAt ? new Date(createdAt) : new Date();
  const adjustedDate = new Date(baseDate);
  const daysToAdd = String(shipping || '').toLowerCase() === 'express' ? 2 : 4;
  adjustedDate.setDate(adjustedDate.getDate() + daysToAdd);
  return adjustedDate.toISOString().split('T')[0];
};

const buildOrderUpdates = (order) => {
  const status = String(order.status || 'pending').toLowerCase();
  const createdAt = order.created_at || order.createdAt || new Date().toISOString();
  const estimatedDelivery = getEstimatedDeliveryDate(order.shipping, createdAt);

  const updates = [
    {
      title: 'Order confirmed',
      message: 'We received your order and it is being prepared for dispatch.',
      time: createdAt
    }
  ];

  if (status === 'cancelled') {
    updates.push({
      title: 'Order cancelled',
      message: 'This order was cancelled by the customer and no further action is required.',
      time: createdAt
    });
  } else if (status === 'fulfilled') {
    updates.push({
      title: 'Delivered',
      message: `Your order was delivered successfully. Thank you for shopping with us.`,
      time: createdAt
    });
  } else {
    updates.push({
      title: 'On the way',
      message: `Your package is being prepared and is expected to arrive by ${estimatedDelivery}.`,
      time: createdAt
    });
  }

  return { estimatedDelivery, updates };
};

loadProducts();

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Unable to open database', err.message);
    process.exit(1);
  }
});

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      customer_address TEXT NOT NULL,
      shipping TEXT,
      payment_method TEXT,
      total REAL,
      created_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER,
      product_id INTEGER,
      name TEXT,
      price REAL,
      quantity INTEGER,
      image TEXT,
      FOREIGN KEY(order_id) REFERENCES orders(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT,
      password_salt TEXT,
      provider TEXT DEFAULT 'local',
      provider_id TEXT,
      session_token TEXT,
      created_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address TEXT,
      phone TEXT,
      notes TEXT,
      created_at TEXT
    )
  `);

  db.run(`ALTER TABLE orders ADD COLUMN status TEXT DEFAULT 'pending'`, (err) => {
    if (err && !/duplicate column/i.test(err.message)) {
      console.error('Unable to add status column to orders', err.message);
    }
  });

  if (fs.existsSync(LEGACY_DATA_FILE)) {
    const raw = fs.readFileSync(LEGACY_DATA_FILE, 'utf-8');
    try {
      const legacyOrders = JSON.parse(raw);
      if (Array.isArray(legacyOrders) && legacyOrders.length > 0) {
        db.get('SELECT COUNT(*) AS count FROM orders', (err, row) => {
          if (err) {
            console.error('Error checking legacy migration status', err.message);
            return;
          }
          if (row.count === 0) {
            const insertOrder = db.prepare(`
              INSERT INTO orders
              (id, customer_name, customer_email, customer_phone, customer_address, shipping, payment_method, total, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            const insertItem = db.prepare(`
              INSERT INTO order_items (order_id, product_id, name, price, quantity, image)
              VALUES (?, ?, ?, ?, ?, ?)
            `);

            legacyOrders.forEach((order) => {
              insertOrder.run(
                order.id,
                order.customer.name || '',
                order.customer.email || '',
                order.customer.phone || '',
                order.customer.address || '',
                order.shipping || '',
                order.paymentMethod || '',
                order.total || 0,
                order.createdAt || new Date().toISOString()
              );

              if (Array.isArray(order.items)) {
                order.items.forEach((item) => {
                  insertItem.run(order.id, item.id || null, item.name, item.price, item.quantity || 1, item.image || '');
                });
              }
            });

            insertOrder.finalize();
            insertItem.finalize();
            console.log('Migrated legacy orders to SQLite database.');
          }
        });
      }
    } catch (error) {
      console.error('Unable to parse legacy orders JSON', error.message);
    }
  }
});

app.use(express.static(path.join(__dirname)));

// ensure images directory exists
const IMAGES_DIR = path.join(__dirname, 'images');
if (!fs.existsSync(IMAGES_DIR)) {
  try { fs.mkdirSync(IMAGES_DIR); } catch (e) { /* ignore */ }
}

// multer storage for uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, IMAGES_DIR),
  filename: (req, file, cb) => {
    const safeName = `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`;
    cb(null, safeName);
  }
});
const upload = multer({ storage });

app.get('/api/products', (req, res) => {
  res.json(products);
});

app.get('/api/products/:id', (req, res) => {
  const productId = Number(req.params.id);
  const product = products.find((item) => item.id === productId);

  if (!product) {
    return res.status(404).json({ error: 'Product not found.' });
  }

  res.json(product);
});

app.get('/api/images', (req, res) => {
  const imagesDir = path.join(__dirname, 'images');
  fs.readdir(imagesDir, (err, files) => {
    if (err) return res.json([]);
    const imgs = files
      .filter((f) => /\.(png|jpe?g|gif|webp)$/i.test(f))
      .map((f) => `images/${f}`);
    res.json(imgs);
  });
});

app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const rel = `images/${req.file.filename}`;
  res.json({ path: rel, filename: req.file.filename });
});

app.post('/api/products', (req, res) => {
  const { name, price, image, description } = req.body;
  if (!name || !price) {
    return res.status(400).json({ error: 'Product name and price are required.' });
  }

  const newProduct = {
    id: nextProductId(),
    name: String(name),
    price: Number(price),
    image: String(image || 'images/placeholder.png'),
    description: String(description || '')
  };

  products.push(newProduct);
  saveProducts();
  res.status(201).json(newProduct);
});

app.patch('/api/products/:id', (req, res) => {
  const productId = Number(req.params.id);
  const { name, price, image, description } = req.body;
  const product = products.find((item) => item.id === productId);

  if (!product) {
    return res.status(404).json({ error: 'Product not found.' });
  }

  if (name) product.name = String(name);
  if (price !== undefined) product.price = Number(price);
  if (image !== undefined) product.image = String(image);
  if (description !== undefined) product.description = String(description);

  saveProducts();
  res.json(product);
});

app.delete('/api/products/:id', (req, res) => {
  const productId = Number(req.params.id);
  const index = products.findIndex((item) => item.id === productId);

  if (index === -1) {
    return res.status(404).json({ error: 'Product not found.' });
  }

  products.splice(index, 1);
  saveProducts();
  res.json({ success: true, id: productId });
});

app.get('/api/locations', (req, res) => {
  db.all('SELECT * FROM locations ORDER BY created_at DESC', (err, rows) => {
    if (err) {
      console.error('Failed to query locations', err.message);
      return res.status(500).json({ error: 'Unable to load locations.' });
    }
    res.json(rows);
  });
});

app.post('/api/locations', (req, res) => {
  const { name, address, phone, notes } = req.body;
  const safeName = String(name || '').trim();

  if (!safeName) {
    return res.status(400).json({ error: 'Location name is required.' });
  }

  const createdAt = new Date().toISOString();
  db.run(
    'INSERT INTO locations (name, address, phone, notes, created_at) VALUES (?, ?, ?, ?, ?)',
    [safeName, String(address || '').trim(), String(phone || '').trim(), String(notes || '').trim(), createdAt],
    function (err) {
      if (err) {
        console.error('Failed to insert location', err.message);
        return res.status(500).json({ error: 'Unable to save location.' });
      }

      res.status(201).json({ success: true, location: { id: this.lastID, name: safeName, address: address || '', phone: phone || '', notes: notes || '', created_at: createdAt } });
    }
  );
});

app.delete('/api/locations/:id', (req, res) => {
  const locationId = Number(req.params.id);
  if (!locationId) {
    return res.status(400).json({ error: 'Invalid location id.' });
  }

  db.run('DELETE FROM locations WHERE id = ?', [locationId], function (err) {
    if (err) {
      console.error('Failed to delete location', err.message);
      return res.status(500).json({ error: 'Unable to delete location.' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Location not found.' });
    }
    res.json({ success: true, id: locationId });
  });
});

app.get('/api/products/orders', (req, res) => {
  db.all('SELECT * FROM order_items', (err, items) => {
    if (err) {
      console.error('Failed to query product orders', err.message);
      return res.status(500).json({ error: 'Unable to load product order summary.' });
    }

    const totals = items.reduce((acc, item) => {
      const key = item.product_id || item.name || 'unknown';
      const quantity = Number(item.quantity || 1);
      const price = Number(item.price || 0);
      if (!acc[key]) {
        acc[key] = { productId: item.product_id || null, name: item.name || 'Unknown product', quantity: 0, revenue: 0, image: item.image || '' };
      }
      acc[key].quantity += quantity;
      acc[key].revenue += price * quantity;
      return acc;
    }, {});

    res.json(Object.values(totals).sort((a, b) => b.quantity - a.quantity));
  });
});

app.post('/api/auth/register', (req, res) => {
  const { name, email, password, provider = 'local', providerId } = req.body;
  const safeName = String(name || '').trim();
  const safeEmail = String(email || '').trim().toLowerCase();
  const safeProvider = String(provider || 'local').trim().toLowerCase();

  if (!safeName || !safeEmail) {
    return res.status(400).json({ error: 'Name and email are required.' });
  }

  if (!['local', 'google', 'apple'].includes(safeProvider)) {
    return res.status(400).json({ error: 'Unsupported sign-in provider.' });
  }

  if (safeProvider === 'local' && !password) {
    return res.status(400).json({ error: 'Password is required for local accounts.' });
  }

  db.get('SELECT * FROM users WHERE email = ? LIMIT 1', [safeEmail], (err, existingUser) => {
    if (err) {
      console.error('Failed to lookup user', err.message);
      return res.status(500).json({ error: 'Unable to create account.' });
    }

    if (existingUser) {
      return res.status(409).json({ error: 'An account with this email already exists. Please sign in instead.' });
    }

    const salt = createSalt();
    const passwordHash = safeProvider === 'local' ? hashPassword(password, salt) : null;
    const token = createToken();
    const createdAt = new Date().toISOString();

    db.run(
      `INSERT INTO users (name, email, password_hash, password_salt, provider, provider_id, session_token, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)` ,
      [safeName, safeEmail, passwordHash, safeProvider === 'local' ? salt : null, safeProvider, providerId || null, token, createdAt],
      function (insertErr) {
        if (insertErr) {
          console.error('Failed to insert user', insertErr.message);
          return res.status(500).json({ error: 'Unable to create account.' });
        }

        res.json({
          success: true,
          user: {
            id: this.lastID,
            name: safeName,
            email: safeEmail,
            provider: safeProvider
          },
          token
        });
      }
    );
  });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password, provider = 'local', providerId } = req.body;
  const safeEmail = String(email || '').trim().toLowerCase();
  const safeProvider = String(provider || 'local').trim().toLowerCase();

  if (!safeEmail) {
    return res.status(400).json({ error: 'Email is required.' });
  }

  db.get('SELECT * FROM users WHERE email = ? LIMIT 1', [safeEmail], (err, user) => {
    if (err) {
      console.error('Failed to query user', err.message);
      return res.status(500).json({ error: 'Unable to sign in.' });
    }

    if (!user) {
      return res.status(404).json({ error: 'No account found for this email.' });
    }

    if (safeProvider !== 'local' && user.provider !== safeProvider) {
      return res.status(401).json({ error: 'Please use the same sign-in method for this account.' });
    }

    if (safeProvider === 'local') {
      if (!user.password_hash || !user.password_salt) {
        return res.status(401).json({ error: 'This account uses a Google or Apple sign-in method.' });
      }
      const expectedHash = hashPassword(password, user.password_salt);
      if (expectedHash !== user.password_hash) {
        return res.status(401).json({ error: 'Incorrect password.' });
      }
    }

    const token = createToken();
    db.run('UPDATE users SET session_token = ?, provider_id = COALESCE(?, provider_id) WHERE id = ?', [token, providerId || null, user.id], (updateErr) => {
      if (updateErr) {
        console.error('Failed to update user token', updateErr.message);
      }

      res.json({
        success: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          provider: user.provider
        },
        token
      });
    });
  });
});

app.post('/api/checkout', (req, res) => {
  const { customer, items, shipping, paymentMethod } = req.body;

  if (!customer || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Invalid checkout request.' });
  }

  const total = items.reduce((sum, item) => sum + Number(item.price || 0), 0);
  const createdAt = new Date().toISOString();

  db.run(
    `INSERT INTO orders (customer_name, customer_email, customer_phone, customer_address, shipping, payment_method, total, created_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      customer.name || '',
      customer.email || '',
      customer.phone || '',
      customer.address || '',
      shipping || '',
      paymentMethod || '',
      total,
      createdAt,
      'pending'
    ],
    function (err) {
      if (err) {
        console.error('Failed to insert order', err.message);
        return res.status(500).json({ error: 'Unable to save order.' });
      }

      const orderId = this.lastID;
      const insertItem = db.prepare(`
        INSERT INTO order_items (order_id, product_id, name, price, quantity, image)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      items.forEach((item) => {
        insertItem.run(orderId, item.id || null, item.name, item.price, item.quantity || 1, item.image || '');
      });

      insertItem.finalize((insertErr) => {
        if (insertErr) {
          console.error('Failed to insert order items', insertErr.message);
          return res.status(500).json({ error: 'Unable to save order items.' });
        }

        const order = {
          id: orderId,
          customer,
          items,
          shipping,
          paymentMethod,
          total,
          createdAt,
          status: 'pending',
          estimatedDelivery: getEstimatedDeliveryDate(shipping, createdAt),
          updates: buildOrderUpdates({ status: 'pending', created_at: createdAt, shipping })
        };

        res.json({ success: true, order });
      });
    }
  );
});

app.get('/api/orders', (req, res) => {
  const requestedEmail = String(req.query.email || '').trim();
  const query = requestedEmail
    ? 'SELECT * FROM orders WHERE customer_email = ? ORDER BY created_at DESC'
    : 'SELECT * FROM orders ORDER BY created_at DESC';
  const params = requestedEmail ? [requestedEmail] : [];

  db.all(query, params, (err, orders) => {
    if (err) {
      console.error('Failed to query orders', err.message);
      return res.status(500).json({ error: 'Unable to load orders.' });
    }

    db.all('SELECT * FROM order_items', (itemErr, items) => {
      if (itemErr) {
        console.error('Failed to query order items', itemErr.message);
        return res.status(500).json({ error: 'Unable to load order items.' });
      }

      const ordersWithItems = orders.map((order) => {
        const orderUpdates = buildOrderUpdates({
          ...order,
          status: order.status || 'pending',
          created_at: order.created_at,
          shipping: order.shipping
        });

        return {
          ...order,
          status: order.status || 'pending',
          customer: {
            name: order.customer_name,
            email: order.customer_email,
            phone: order.customer_phone,
            address: order.customer_address
          },
          items: items.filter((item) => item.order_id === order.id),
          estimatedDelivery: orderUpdates.estimatedDelivery,
          updates: orderUpdates.updates
        };
      });

      res.json(ordersWithItems);
    });
  });
});

app.patch('/api/orders/:id', (req, res) => {
  const orderId = Number(req.params.id);
  const { status } = req.body;

  if (!orderId || !status || !['pending', 'fulfilled', 'cancelled'].includes(status)) {
    return res.status(400).json({ error: 'Invalid order update.' });
  }

  db.run('UPDATE orders SET status = ? WHERE id = ?', [status, orderId], function (err) {
    if (err) {
      console.error('Failed to update order status', err.message);
      return res.status(500).json({ error: 'Unable to update order.' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Order not found.' });
    }
    res.json({ success: true, id: orderId, status });
  });
});

app.delete('/api/orders/:id', (req, res) => {
  const orderId = Number(req.params.id);
  if (!orderId) {
    return res.status(400).json({ error: 'Invalid order id.' });
  }

  db.run('DELETE FROM order_items WHERE order_id = ?', [orderId], (itemErr) => {
    if (itemErr) {
      console.error('Failed to delete order items', itemErr.message);
      return res.status(500).json({ error: 'Unable to delete order items.' });
    }

    db.run('DELETE FROM orders WHERE id = ?', [orderId], function (orderErr) {
      if (orderErr) {
        console.error('Failed to delete order', orderErr.message);
        return res.status(500).json({ error: 'Unable to delete order.' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Order not found.' });
      }
      res.json({ success: true, id: orderId });
    });
  });
});

app.post('/api/paystack/initialize', async (req, res) => {
  try {
    const { email, amount } = req.body;
    console.log('Paystack initialize request', { email, amount });

    const response = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email,
        amount: amount * 100 // Paystack expects the amount in kobo
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const paystackData = response.data && response.data.data ? response.data.data : response.data;
    console.log('Paystack initialize response', { status: response.status, data: paystackData });

    if (!paystackData || !paystackData.reference) {
      return res.status(500).json({ error: 'Paystack initialization returned an unexpected response.' });
    }

    res.json({ success: true, data: paystackData });
  } catch (error) {
    console.error('Paystack initialize error', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message
    });

    let serverError = 'Failed to initialize payment';

    if (error.response?.status === 405) {
      serverError = 'Method not allowed. This usually means the Paystack API credentials or endpoint is incorrect. Please verify your PAYSTACK_SECRET_KEY in the .env file.';
    } else if (error.response?.data?.message) {
      serverError = error.response.data.message;
    } else if (error.response?.data) {
      serverError = typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data);
    } else if (error.message) {
      serverError = error.message;
    }

    res.status(500).json({ error: serverError });
  }
});

app.post('/api/paystack/verify', async (req, res) => {
  try {
    const { reference, customer, items, shipping, paymentMethod, total } = req.body;

    if (!reference) return res.status(400).json({ error: 'Missing reference' });

    const verifyResp = await axios.get(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
    });

    const data = verifyResp.data && verifyResp.data.data;
    if (!data || data.status !== 'success') {
      return res.status(400).json({ error: 'Payment not successful' });
    }

    // optional: verify amount matches
    const paidAmount = Number(data.amount || 0) / 100; // convert kobo to naira
    if (Math.round(paidAmount) !== Math.round(Number(total || 0))) {
      console.warn('Paid amount does not match order total', { paidAmount, total });
      // continue but mark as warning
    }

    const createdAt = new Date().toISOString();

    // create order only after successful verification
    db.run(
      `INSERT INTO orders (customer_name, customer_email, customer_phone, customer_address, shipping, payment_method, total, created_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        customer?.name || '',
        customer?.email || '',
        customer?.phone || '',
        customer?.address || '',
        shipping || '',
        paymentMethod || 'Paystack',
        total || 0,
        createdAt,
        'fulfilled'
      ],
      function (err) {
        if (err) {
          console.error('Failed to insert order after verification', err.message);
          return res.status(500).json({ error: 'Unable to save order.' });
        }

        const orderId = this.lastID;
        const insertItem = db.prepare(`
          INSERT INTO order_items (order_id, product_id, name, price, quantity, image)
          VALUES (?, ?, ?, ?, ?, ?)
        `);

        (items || []).forEach((item) => {
          insertItem.run(orderId, item.id || null, item.name, item.price, item.quantity || 1, item.image || '');
        });

        insertItem.finalize((insertErr) => {
          if (insertErr) {
            console.error('Failed to insert order items after verification', insertErr.message);
            return res.status(500).json({ error: 'Unable to save order items.' });
          }

          const order = {
            id: orderId,
            customer,
            items,
            shipping,
            paymentMethod,
            total,
            createdAt,
            status: 'fulfilled',
            estimatedDelivery: getEstimatedDeliveryDate(shipping, createdAt),
            updates: buildOrderUpdates({ status: 'fulfilled', created_at: createdAt, shipping })
          };

          res.json({ success: true, order });
        });
      }
    );
  } catch (error) {
    console.error('Paystack verify error', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message
    });

    let serverError = 'Payment verification failed.';

    if (error.response?.status === 405) {
      serverError = 'Method not allowed. This usually means the Paystack API credentials or endpoint is incorrect.';
    } else if (error.response?.data?.message) {
      serverError = error.response.data.message;
    } else if (error.response?.data) {
      serverError = typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data);
    } else if (error.message) {
      serverError = error.message;
    }

    res.status(500).json({ error: serverError });
  }
});
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${PORT}`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Cannot start server: port ${PORT} is already in use. Stop the other server or choose a different PORT.`);
    process.exitCode = 1;
    return;
  }

  throw error;
});

