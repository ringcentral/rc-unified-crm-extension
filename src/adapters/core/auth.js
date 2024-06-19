const {UserModel1} = require('../models/userModel');
const Op = require('sequelize').Op;


async function saveUserInfo(userObj){
    try {
        // console.log(userObj);
        let id = userObj.id;
        const existingUser = await UserModel1.findOne({
            where: {
                [Op.and]: [
                    {
                        id,
                        // platform
                    }
                ]
            }
        });
        if (existingUser) {
            console.log('Existing user update');
            // const updateUser = await UserModel1.update({

            // })
        }
        else {
            console.log('This is userobj',userObj);
            const createUser = await UserModel1.create({
                id: userObj.id, firstname: userObj.first_name, lastname: userObj.last_name,
                email: userObj.email,
                license_key_id: process.env.license_key_id
            })
            console.log(createUser);
        }    
    } catch (error) {
        console.log(error);
        return error
    }
}

exports.saveUserInfo = saveUserInfo;