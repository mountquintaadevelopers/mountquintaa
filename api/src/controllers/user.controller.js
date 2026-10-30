const userService = require('../services/user.service');

exports.createUser = async (req, res) => {
  const user = await userService.createUser(req.body);
  res.status(201).json(user);
};

exports.getUsers = async (req, res) => {
  const users = await userService.getUsers();
  res.json(users);
};

exports.getUserById = async (req, res) => {
  const user = await userService.getUserById(req.params.id);
  res.json(user);
};

exports.updateUser = async (req, res) => {
  const user = await userService.updateUser(req.params.id, req.body);
  res.json(user);
};

exports.deleteUserById = async (req, res) => {
  await userService.deleteUserById(req.params.id);
  res.json({ message: 'User deleted' });
};