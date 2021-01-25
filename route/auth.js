var express = require('express')
var bcrypt = require("bcrypt-inzi")
var jwt = require('jsonwebtoken');
var postmark = require("postmark");
var emailApi = process.env.API_TOKEN;

var client = new postmark.ServerClient(emailApi);
// var client = new postmark.ServerClient("");
var {
    otpModel,
    userModel,
} = require("./../dbcon/module");



// var {
//     userModel
// } = require('./../dbcon/module')
var router = express.Router();
var SERVER_SECRET = process.env.SECRET || "1234";

router.post("/signup", (req, res, next) => {

    if (!req.body.name ||
        !req.body.email ||
        !req.body.password ||
        !req.body.phone ||
        !req.body.gender) {

        res.status(403).send(`
            please send name, email, passwod, phone and gender in json body.
            e.g:
            {
                "name": "Ahmer",
                "email": "skahmer@gmail.com",
                "password": "123",
                "phone": "03462858293",
                "gender": "Male"
            }`)
        return;
    }

    userModel.findOne({
            email: req.body.email
        },
        function (err, doc) {
            if (!err && !doc) {
              
                bcrypt.stringToHash(req.body.password).then(function (hash) {

                    var newUser = new userModel({
                        "name": req.body.name,
                        "email": req.body.email,
                        "password": hash,
                        "phone": req.body.phone,
                        "gender": req.body.gender,
                    })
                    newUser.save((err, data) => {
                        if (!err) {
                            res.send({
                                status: 200,
                                message: "user created"
                            })
                        } else {
                            console.log(err);
                            res.status(500).send({
                               
                                message: "user create error, " + err
                            })
                        }
                    });
                })

            } else if (err) {
                res.status(500).send({
                    message: "db error"
                })
            } else {
                res.send({
                    message: "user already exist"
                })
            }
        })

})

router.post("/login", (req, res, next) => {


    if (!req.body.email || !req.body.password) {

        res.status(403).send(`
            please send email and passwod in json body.
            e.g:
            {
                "email": "skahmer@gmail.com",
                "password": "123",
            }`)
        return;
    }

    userModel.findOne({
            email: req.body.email

        },
        function (err, user) {
          
            if (err) {
                res.status(500).send({
                    message: "an error occured: " + JSON.stringify(err)
                });
            } else if (user) {

                bcrypt.varifyHash(req.body.password, user.password).then(isMatched => {
                    if (isMatched) {
                        console.log("matched");

                        var token =
                            jwt.sign({
                                id: user._id,
                                name: user.name,
                                email: user.email,
                            }, SERVER_SECRET)

                        res.cookie('jToken', token, {
                            maxAge: 86_400_000,
                            httpOnly: true

                        });
                    

                        res.send({
                            message: "login success",
                            user: {
                                name: user.name,
                                email: user.email,
                                phone: user.phone,
                                gender: user.gender,
                            }
                        });

                    } else {
                        console.log("not matched");
                        res.send({
                            status:401,
                            message: "incorrect password"
                        })
                    }
                }).catch(e => {
                    console.log("error: ", e)
                })



            } else {
                res.send({
                    status :403,
                    message : "user not found"
                });
            }
        });
})

router.post("/logout", (req, res, next) => {
    res.clearCookie('jToken', {

        maxAge: 86_400_000,
        httpOnly: true,
    })
    res.send("logout success");
})

router.post('/forget-password', (req, res, next) => {
  
    if (!req.body.email) {
        res.status(403).send({
            message: "please provide email"
        })
        return;
   
    }
    userModel.findOne({
        email: req.body.email
    }, (err, user) => {
        if (err) {
            res.status(500).send({
                message: "Something went wrong"
            })
        } else if (user) {
            console.log(user)
            const otp = Math.floor(generetOtp(111111, 999999))
            console.log("otp is===>"),
            console.log(req.body.email)
            otpModel.create({
                email: req.body.email,
                otpCode: otp
            }).then((data) => {
                client.sendEmail({
                    "From": "ahmer_student@sysborg.com",
                    "To": req.body.email,
                    "Subject": "Reset Your Password",
                    "Textbody": `Here is your Reset password code : ${otp}`
                }).then((status) => {
                    res.send({
                        status: 200,
                        message: "success",
                        otp : otp,
                    })
                    // isko check karo
                }).catch((err) => {
                    res.send({
                        message: "error"
                    })
                })

                if (user) {
                    res.send({
                        message: "User found",
                        otp
                    })
                }
            })
        } else {
            res.send({
                message: "User not found"
            })
        }
    })

})



router.post("/forget-password-step-2", (req, res, next) => {

    console.log("mera otp " + req.body.otpCode)

    console.log("mera password " + req.body.newPassword)
    console.log("mera email " + req.body.emailVarification)

    if (!req.body.emailVarification || !req.body.otpCode || !req.body.newPassword) {

        res.status(403).send(`
            please send emailVarification & otp in json body.
            e.g:
            {
                "emailVarification": "malikasinger@gmail.com",
                "newPassword": "xxxxxx",
                "otp": "xxxxx" 
            }`)
        return;
    }

    userModel.findOne({
            email: req.body.emailVarification
        },
        function (err, user) {

            if (err) {
                res.status(500).send({
                    message: "an error occured: " + JSON.stringify(err)
                });
            } else if (user) {

                otpModel.find({
                        email: user.email
                    },{},
                    function (err, otpData) {

                        console.log( "ye otp hai  " + otpData)
                        console.log( " otp mondel ka errra hai "  +    err)



                        if (err) {
                            res.send({
                                message: "an error occured: " + JSON.stringify(err)
                            });
                        } else if (otpData) {
                            otpData = otpData[otpData.length - 1]

                            console.log("otpData: ", otpData);

                            const now = new Date().getTime();
                            const otpIat = new Date(otpData.createdOn).getTime();
                            const diff = now - otpIat;

                            console.log("diff: ", diff);

                            if (otpData.otpCode === req.body.otpCode && diff < 300000) {
                                console.log(" sab se bada masla hai " + otpData.otpCode)

                                
                                bcrypt.stringToHash(req.body.newPassword).then(function (hash) {
                                    user.update({
                                            password: hash
                                        }, {},
                                        function (err, data) {
                                            res.send({
                                                status: 200,
                                                message: "password updated"
                                            });
                                        }).then(err=>console.log("aya",err))
                                })

                            } else {
                                res.send({
                                    message: "incorrect otp"
                                });
                            }
                        } else {
                            res.send({
                                message: "incorrect otp ye kia "
                            });
                        }
                    })

            } else {
                res.send({
                    message: "user  not found"
                });
            }
        });
})
// router.post("/forget-password-step-2", (req, res, next) => {

//     console.log(req.body.otpCode)
//     console.log(req.body.newPassword)
//     console.log(req.body.emailVarification)

//     if (!req.body.emailVarification && !req.body.otpCode && !req.body.newPassword) {

//         res.status(403).send(`
//             please send emailVarification & otp in json body.
//             e.g:
//             {
//                 "emailVarification": "malikasinger@gmail.com",
//                 "newPassword": "xxxxxx",
//                 "otp": "xxxxx" 
//             }`)
//         return;
//     }

//     userModel.findOne({email: req.body.emailVarification},
//         function (err, user) {
//             console.log(req.body.emailVarification)
//             console.log(err)
//             if (err) {
//                 res.status(500).send({
//                     message: "an error occured: " + JSON.stringify(err)
//                 });
//             } else if (user) {
//                 console.log(user)

//                 otpModel.find({
//                     email: req.body.emailVarification
//                 },
//                     function (err, otpData) {
//                         console.log(req.body.emailVarification)


//                         if (err) {
//                             res.send({
//                                 message: "an error occured: " + JSON.stringify(err)
//                             });
//                         } else if (otpData) {
//                             otpData = otpData[otpData.length - 1]

//                             console.log("otpData: ", otpData);

//                             const now = new Date().getTime();
//                             const otpIat = new Date(otpData.createdOn).getTime();
//                             const diff = now - otpIat;

//                             console.log("diff: ", diff);

//                             if (otpData.otpCode === req.body.otpCode && diff < 300000) {

//                                 bcrypt.stringToHash(req.body.newPassword).then(function (hash) {
//                                     user.update({password:hash }, {}, function (err, data) {
//                                         // isme data q likha ha many

//                                         res.send({
//                                             status: 200,
//                                             message: "password updated"
//                                         });
//                                     })
//                                 })

//                             } else {
//                                 res.send({
//                                     message: "incorrect otp"
//                                 });
//                             }
//                         } else {
//                             res.send({
//                                 message: "incorrect otp"
//                             });
//                         }
//                     })

//             } else {
//                 res.send({
//                     message: "user not found"
//                 });
//             }
//         });
// })
















function generetOtp(min, max) {
    return Math.random() * (max - min) + min;
}
module.exports = router;