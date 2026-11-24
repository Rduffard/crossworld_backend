# Crossworld Backend API

For backend validation, VM deployment and engine dependency updates, see the [Crossworld deployment runbook](https://github.com/Rduffard/sanguine-engine/blob/main/DEPLOYMENT.md).

A centralized, scalable **Node.js + Express + MongoDB backend** powering multiple projects under the **Crossworld Creative** umbrella.

This API began as the backend for **WTWR (What to Wear)** and has since evolved into a shared service designed to support multiple applications, user domains, and feature sets from a single, well-structured codebase.

---

## 🧠 Purpose & Philosophy

Rather than maintaining isolated backends for each project, this repository serves as a **unified API platform** that:

- Shares **authentication and user identity** across projects
- Exposes **project-specific routes** where needed
- Encourages **code reuse, consistency, and maintainability**
- Reflects a real-world, production-style backend architecture

Each frontend consumes only the endpoints it needs, while the backend remains cohesive and extensible.

---

## 🚀 Projects Powered by This Backend

### 1️⃣ WTWR – _What To Wear_

A weather-based clothing recommendation app.

**Status:** ✅ Complete  
**Role:** Original backend foundation

Features:

- User authentication (JWT)
- Secure password hashing
- Clothing item CRUD
- Likes / ownership logic
- Validation and centralized error handling

WTWR served as the proving ground for the backend’s structure and standards.

---

### 2️⃣ Crossworld Creative – Portfolio Platform

A personal portfolio and creative hub showcasing multiple projects.

**Status:** 🛠 In active development  
**Role:** Central identity & platform layer

Planned / ongoing features:

- Shared user accounts across all Crossworld projects
- Project metadata and access control
- Public vs authenticated experiences
- Future admin and content management endpoints

This backend acts as the **core identity layer** for the Crossworld ecosystem.

---

### 3️⃣ Squash – Bug & QA Tracking Platform

A QA-focused issue tracking and project management tool.

**Status:** 🛠 In active development  
**Role:** Project-specific domain API

Planned features:

- Projects, issues, and workflow states
- User roles and permissions
- Comments, activity logs, and assignments
- Future automation and QA-centric tooling

Squash will consume the same auth system while introducing its own domain logic.

---

## 🏗 Architecture Overview

- **Node.js / Express** – API framework
- **MongoDB / Mongoose** – Data modeling & persistence
- **JWT Authentication** – Stateless auth across services
- **bcrypt** – Secure password hashing
- **Celebrate / Joi** – Request validation
- **Centralized error handling** – Custom error classes
- **Winston + express-winston** – Request & error logging
- **Modular routing** – Shared vs project-specific routes

The codebase is intentionally organized to scale as new projects are added.

---

## 🔐 Authentication Model

- Users authenticate once
- JWTs are shared across all consuming applications
- Each project enforces its own authorization rules
- Enables SSO-like behavior across Crossworld projects

---

## 🌱 Future Expansion

This backend is designed to grow alongside the Crossworld Creative ecosystem, including:

- Additional applications
- Shared services (notifications, uploads, email, etc.)
- Role-based access control
- External API integrations
- Production deployment hardening

---

## 🧑‍💻 Author

**Romain Duffard**  
QA Analyst → Software Engineer  
Crossworld Creative

This project reflects a real-world transition from a single-app backend to a multi-project platform — prioritizing clarity, scalability, and long-term maintainability.

---

## 📄 License

MIT (or update as needed)
