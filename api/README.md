# Node.js Express API Boilerplate

A clean, scalable boilerplate for building REST APIs with Node.js and Express. This boilerplate includes authentication, user management, and product management with GET, POST, and DELETE operations.

## Features

- 🚀 **Express.js** - Fast, unopinionated web framework
- 🔐 **JWT Authentication** - Secure token-based authentication
- 📝 **Input Validation** - Request validation using express-validator
- 🛡️ **Security** - Helmet, CORS, rate limiting
- 📊 **MongoDB** - MongoDB with Mongoose ODM
- 🔍 **Search & Pagination** - Built-in search and pagination support
- 📝 **Logging** - Morgan HTTP request logger
- ⚡ **Performance** - Compression middleware
- 🧪 **Testing Ready** - Jest testing framework setup

## API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Get current user

### Users
- `GET /api/users` - Get all users (protected)
- `GET /api/users/:id` - Get user by ID (protected)
- `POST /api/users` - Create new user
- `PUT /api/users/:id` - Update user (protected)
- `DELETE /api/users/:id` - Delete user (protected)

### Products
- `GET /api/products` - Get all products with pagination
- `GET /api/products/search` - Search products
- `GET /api/products/:id` - Get product by ID
- `POST /api/products` - Create new product (protected)
- `PUT /api/products/:id` - Update product (protected)
- `DELETE /api/products/:id` - Delete product (protected)

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Setup

Copy the environment file and configure your variables:

```bash
cp env.example .env
```

Edit `.env` with your configuration:

```env
PORT=3000
NODE_ENV=development
MONGO_URI=mongodb://localhost:27017/node-express-api
JWT_SECRET=your-super-secret-jwt-key
```

### 3. Database Setup

Make sure MongoDB is running on your system, or update the `MONGO_URI` in your `.env` file.

### 4. Run the Application

**Development mode (with auto-reload):**
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

### 5. Test the API

The server will start on `http://localhost:3000`

**Health Check:**
```bash
curl http://localhost:3000/health
```

**API Info:**
```bash
curl http://localhost:3000/api
```

## Project Structure

```
src/
├── app.js              # Main application file
├── config/
│   └── db.js          # Database connection
├── controllers/        # Route controllers
│   ├── authController.js
│   ├── userController.js
│   └── productController.js
├── middleware/         # Custom middleware
│   ├── auth.js        # Authentication middleware
│   ├── errorHandler.js # Error handling
│   └── notFound.js    # 404 handler
├── models/             # Database models
│   ├── User.js
│   └── Product.js
└── routes/             # API routes
    ├── index.js        # Main router
    ├── authRoutes.js   # Authentication routes
    ├── userRoutes.js   # User routes
    └── productRoutes.js # Product routes
```

## Usage Examples

### Creating a User

```bash
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "age": 30
  }'
```

### User Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "password123"
  }'
```

### Creating a Product (with authentication)

```bash
curl -X POST http://localhost:3000/api/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "Sample Product",
    "description": "A sample product description",
    "price": 29.99,
    "category": "Electronics",
    "stock": 100
  }'
```

### Getting Products with Pagination

```bash
curl "http://localhost:3000/api/products?page=1&limit=5"
```

### Searching Products

```bash
curl "http://localhost:3000/api/products/search?q=laptop&category=Electronics&minPrice=100&maxPrice=1000"
```

## Adding New Routes

### 1. Create Controller

```javascript
// src/controllers/exampleController.js
const Example = require('../models/Example');

const getExamples = async (req, res) => {
  try {
    const examples = await Example.find();
    res.json({
      success: true,
      data: examples
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

const createExample = async (req, res) => {
  try {
    const example = new Example(req.body);
    await example.save();
    res.status(201).json({
      success: true,
      message: 'Example created successfully',
      data: example
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

module.exports = {
  getExamples,
  createExample
};
```

### 2. Create Routes

```javascript
// src/routes/exampleRoutes.js
const express = require('express');
const router = express.Router();
const exampleController = require('../controllers/exampleController');

router.get('/', exampleController.getExamples);
router.post('/', exampleController.createExample);

module.exports = router;
```

### 3. Mount Routes

```javascript
// src/routes/index.js
const exampleRoutes = require('./exampleRoutes');
router.use('/examples', exampleRoutes);
```

## Scripts

- `npm start` - Start production server
- `npm run dev` - Start development server with nodemon
- `npm test` - Run tests
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint issues

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3000 |
| `NODE_ENV` | Environment | development |
| `MONGO_URI` | MongoDB connection string | mongodb://localhost:27017/node-express-api |
| `JWT_SECRET` | JWT secret key | your-secret-key |
| `ALLOWED_ORIGINS` | CORS allowed origins | http://localhost:3000 |

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License.


project-root/
│
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│
├── src/
│   ├── config/
│   │   ├── env.js
│   │   └── database.js
│   │
│   ├── routes/
│   │   ├── index.js
│   │   └── v1/
│   │       ├── index.js
│   │       ├── auth.routes.js
│   │       └── user.routes.js
│   │
│   ├── controllers/  
│   ├── services/
│   ├── repositories/
│   ├── middlewares/
│   ├── utils/
│   │   └── ApiError.js
│   │
│   ├── app.js
│   └── server.js
│
├── .env
├── package.json
└── README.md

