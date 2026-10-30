const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../prisma');
const HttpError = require('../utils/http-error');
const { parsePageLimit } = require('../utils/productListQuery');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const ROLES = ['ADMIN', 'SCANNER'];

const sanitizeAdminUser = (user) => {
  const { password, ...rest } = user;
  return rest;
};

const login = async ({ email, password }) => {
  if (!email || !password) throw new HttpError('email and password are required', 400);

  const admin = await prisma.adminUser.findUnique({ where: { email } });
  if (!admin) throw new HttpError('Invalid credentials', 401);

  const match = await bcrypt.compare(password, admin.password);
  if (!match) throw new HttpError('Invalid credentials', 401);

  const token = jwt.sign({ id: admin.id, role: admin.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  return { token, user: sanitizeAdminUser(admin) };
};

const listAdminUsers = async (query) => {
  const { page, limit } = parsePageLimit(query);
  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    prisma.adminUser.findMany({ skip, take: limit, orderBy: { createdAt: 'desc' } }),
    prisma.adminUser.count()
  ]);

  return {
    data: data.map(sanitizeAdminUser),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 }
  };
};

const createAdminUser = async ({ name, email, password, role }) => {
  if (!name || !email || !password) {
    throw new HttpError('name, email and password are required', 400);
  }
  if (role && !ROLES.includes(role)) throw new HttpError('Invalid role', 400);

  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing) throw new HttpError('Email already in use', 409);

  const hashed = await bcrypt.hash(password, 10);
  const user = await prisma.adminUser.create({
    data: { name, email, password: hashed, role: role || 'SCANNER' }
  });
  return sanitizeAdminUser(user);
};

const updateAdminUser = async (id, { name, email, password, role }) => {
  const userId = parseInt(id, 10);
  const existing = await prisma.adminUser.findUnique({ where: { id: userId } });
  if (!existing) throw new HttpError('Admin/scanner user not found', 404);
  if (role && !ROLES.includes(role)) throw new HttpError('Invalid role', 400);

  const data = {};
  if (name !== undefined) data.name = name;
  if (email !== undefined) data.email = email;
  if (role !== undefined) data.role = role;
  if (password) data.password = await bcrypt.hash(password, 10);

  const updated = await prisma.adminUser.update({ where: { id: userId }, data });
  return sanitizeAdminUser(updated);
};

const deleteAdminUser = async (id) => {
  const userId = parseInt(id, 10);
  const existing = await prisma.adminUser.findUnique({ where: { id: userId } });
  if (!existing) throw new HttpError('Admin/scanner user not found', 404);
  await prisma.adminUser.delete({ where: { id: userId } });
};

module.exports = {
  login,
  listAdminUsers,
  createAdminUser,
  updateAdminUser,
  deleteAdminUser,
  sanitizeAdminUser
};
