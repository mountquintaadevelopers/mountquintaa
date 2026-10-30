const prisma = require('../prisma');

const createUser = async (data) => {
  const user = await prisma.user.create({
    data: data
  });
  return user;
};

const getUsers= async () =>{
    const users = await prisma.user.findMany();
    return users;
}
const getUserById = async (id) =>{
    const user = await prisma.user.findFirst({
        where: {
           OR:[
           { id:  parseInt(id) || 0},
            { uid: id}
           ]
           
        }
    });
    return user;
}
const updateUser = async (id,data)=>{
    const user = await prisma.user.update({
        where:{
            id: id
        },
     data
    });
    return user;
}

const deleteUser = async (id)=>{
    const user = await prisma.user.delete({
        where:{
            id: id
        }
    });
    return user;
}
const deleteUserById = async (id)=>{
    const user = await prisma.user.delete({
        where:{
            id:id
        }
    });
    return user;
}

module.exports = {
    createUser,
    getUsers,
    getUserById,
    updateUser,
    deleteUser,
    deleteUserById
};