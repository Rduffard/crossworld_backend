# WTWR (What to Wear?): Back End

This project is the back end for the **WTWR (What to Wear?)** application. It provides a RESTful API built with Express and MongoDB, supporting user authentication, protected routes, and role-based permissions.

The server handles user registration and login, secure password storage, authorization via JSON Web Tokens (JWT), and CRUD operations for clothing items with ownership restrictions.

## Features

- **User authentication**
  - User signup with validation and hashed passwords
  - User signin with JWT-based authentication
- **Authorization middleware**
  - Protects private routes using Bearer tokens
  - Public access for signup, signin, and viewing items
- **User profile management**
  - Get current user (`GET /users/me`)
  - Update profile information (`PATCH /users/me`)
- **Clothing items**
  - Create, read, like, and dislike items
  - Only item owners can delete their own items (403 Forbidden otherwise)
- **Security**
  - Passwords are hashed with bcrypt
  - Password hashes are never returned in API responses
- **Error handling**
  - Centralized status codes (400, 401, 403, 404, 409, 500)
  - Consistent error responses across controllers

## Technologies Used

- Node.js
- Express.js
- MongoDB
- Mongoose
- JWT (jsonwebtoken)
- bcryptjs
- ESLint
- CORS

## Running the Project Locally

Start the server:

npm run start

Start the server with hot reload enabled:

npm run dev

The server runs on port **3001** by default.

## API Overview

### Public Routes

- POST /signup — create a new user
- POST /signin — authenticate a user and return a JWT
- GET /items — retrieve all clothing items

### Protected Routes

(Require an Authorization header)

- GET /users/me — get the current user
- PATCH /users/me — update user profile
- POST /items — create a clothing item
- DELETE /items/:itemId — delete an item (owner only)
- PUT /items/:itemId/likes — like an item
- DELETE /items/:itemId/likes — remove a like

Authorization header format:

Authorization: Bearer <JWT>

## Project Structure

- models/ — Mongoose schemas
- controllers/ — Request handling logic
- routes/ — API route definitions
- middlewares/ — Authorization middleware
- utils/ — Configuration and error constants
- app.js — Application entry point

## Link

- github repository: https://github.com/Rduffard/se_project_express

## Project Pitch Video

Check out [this video](https://drive.google.com/file/d/1IUrfnz3PYlEqUs3viGk2a6vA1ehKXFjd/view?usp=drive_link), where I describe my
project and some challenges I faced while building it.
