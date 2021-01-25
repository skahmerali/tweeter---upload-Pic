var express = require("express");
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var cors = require("cors");
var morgan = require("morgan");
var app = express();
var path = require("path")
var SERVER_SECRET = process.env.SECRET || "1234";
var jwt = require('jsonwebtoken')
var { userModel, tweetmodel } = require('./dbcon/module');
var authRoutes = require('./route/auth')
var http = require("http");
var socketIO = require("socket.io");
var server = http.createServer(app);
var io = socketIO(server);
var fs = require("fs")
var multer = require("multer")
// var admin = require("firebase-admin")



const storage = multer.diskStorage({
    destination: './uploads/',
    filename: function (req, file, cb) {
        cb(null, `${new Date().getTime()}-${file.filename}.${file.mimetype.split("/")[1]}`)
    }
})

var upload = multer({ storage: storage })

const admin = require("firebase-admin");

// var serviceAccount =    {}
var serviceAccount = JSON.parse(process.env.SERVICE_ACCOUNT)
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://tweeter0001-16162-default-rtdb.firebaseio.com/"
});
const bucket = admin.storage().bucket("gs://tweeter0001-16162.appspot.com/");

//==============================================


io.on("connection", () => {
    console.log("user Connected")
})


app.use(bodyParser.json());
app.use(cookieParser());

app.use(cors({
    origin: '*',
    credentials: true
}));

app.use(morgan('dev'));

app.use("/", express.static(path.resolve(path.join(__dirname, "public"))))

app.use('/', authRoutes);
// app.use('/',authRoutes);

app.use(function (req, res, next) {

    console.log("req.cookies: ", req.cookies.jToken);
    if (!req.cookies.jToken) {
        res.status(401).send("include http-only credentials with every request")
        return;
    }
    jwt.verify(req.cookies.jToken, SERVER_SECRET, function (err, decodedData) {
        if (!err) {

            const issueDate = decodedData.iat * 1000;
            const nowDate = new Date().getTime();
            const diff = nowDate - issueDate;

            if (diff > 300000) {
                res.status(401).send("token expired")
            } else {
                var token = jwt.sign({
                    id: decodedData.id,
                    name: decodedData.name,
                    email: decodedData.email,
                }, SERVER_SECRET)
                res.cookie('jToken', token, {
                    maxAge: 86_400_000,
                    httpOnly: true
                });
                req.body.jToken = decodedData
                req.headers.jToken = decodedData
                next();
            }
        } else {
            res.status(401).send("invalid token")
        }
    });
})

app.get("/profile", (req, res, next) => {

    console.log(req.body)

    userModel.findById(req.body.jToken.id, 'name email phone gender  createdOn profilePic',
        function (err, doc) {
            if (!err) {
                res.send({
                    profile: doc
                })

            } else {
                res.status(500).send({
                    message: "server error"
                })
            }
        })
})
app.post("/tweetImg", upload.any(), (req, res, next) => {

    // console.log("req.body: ", req.body);
    bucket.upload(
        req.files[0].path,
        function (err, file, apiResponse) {
            if (!err) {
                file.getSignedUrl({
                    action: 'read',
                    expires: '03-09-2491'
                }).then((urlData, err) => {
                    if (!err) {
                        console.log("public downloadable url: ", urlData[0])
                        userModel.findById(req.headers.jToken.id, 'name profilePic email', (err,user)=>{
                            console.log("user =======>", user.email)
                            if (!err) {
                                tweetmodel.create({
                                    "name": user.name,
                                    "tweet": req.body.tweet,
                                   "profilePic": user.profilePic,
                                   "tweetImg": urlData[0],
                                }).then((data) => {
                                    console.log(data)
                                    res.send({
                                        status: 200,
                                        message: "Post created",
                                        data: data
                                    })
                                    console.log(data)
                                    io.emit("NEW_POST", data)

                                }).catch(() => {
                                    console.log(err);
                                    res.status(500).send({
                                        message: "user create error, " + err
                                    })
                                })
                            }
                            else{
                                res.send("err")
                            }
                        })
                        try {
                            fs.unlinkSync(req.files[0].path)
                        } catch (err) {
                            console.error(err)
                        }
                    }
                })
            } else {
                console.log("err: ", err)
                res.status(500).send();
            }
        });
})
app.post(`/tweet`, (req, res, next)=>{
    userModel.findOne({ email: req.body.userEmail }, (err, user) => {
        // console.log("khsajhfkjdha" + user)
        if (!err) {
            tweetmodel.create({
                "name": req.body.userName,
                "tweet": req.body.tweet,
                "profilePic": user.profilePic
            }).then((data) => {
                // console.log( "jdjhkasjhfdk" +  data)
                res.send({
                    status: 200,
                    message: "Post created",
                    data: data
                })
                
                console.log(data)
                io.emit("NEW_POST", data)
                
            }).catch(() => {
                console.log(err);
                res.status(500).send({
                    message: "user create error, " + err
                })
            })
        }
        else {
            console.log(err)
        }
    })
    
})

// app.post('/tweet', (req, res, next) => {
//     // console.log(req.body)

//     if (!req.body.userName && !req.body.tweet || !req.body.userEmail) {
//         res.status(403).send({
//             message: "please provide email or tweet/message"
//         })
//     }
//     var newTweet = new tweetmodel({
//         "name": req.body.userName,
//         "tweet": req.body.tweet
//     })
//     newTweet.save((err, data) => {
//         if (!err) {
//             res.send({
//                 status: 200,
//                 message: "Post created",
//                 data: data
//             })
//             console.log(data.tweet)
//             io.emit("NEW_POST", data)
//         } else {
//             console.log(err);
//             res.status(500).send({
//                 message: "user create error, " + err
//             })
//         }
//     });
// })

app.get('/getTweets', (req, res, next) => {

    console.log(req.body)
    tweetmodel.find({}, (err, data) => {
        if (err) {
            console.log(err)
        }
        else {
            console.log(data)
            // data = data[data.length -1]
            res.send(data)
        }
    })
})

/////////////////////////////// profile

app.post("/upload", upload.any(), (req, res, next) => {

    console.log("req.body: ", req.body);
    console.log("req.body: ", JSON.parse(req.body.myDetails));
    console.log("req.files: ", req.files);

    console.log("uploaded file name: ", req.files[0].originalname);
    console.log("file type: ", req.files[0].mimetype);
    console.log("file name in server folders: ", req.files[0].filename);
    console.log("file path in server folders: ", req.files[0].path);

    bucket.upload(
        req.files[0].path,
        // {
        //     destination: `${new Date().getTime()}-new-image.png`, // give destination name if you want to give a certain name to file in bucket, include date to make name unique otherwise it will replace previous file with the same name
        // },
        function (err, file, apiResponse) {
            if (!err) {
                // console.log("api resp: ", apiResponse);

                file.getSignedUrl({
                    action: 'read',
                    expires: '03-09-2491'
                }).then((urlData, err) => {
                    if (!err) {
                        console.log("public downloadable url: ", urlData[0]) // this is public downloadable url 
                        console.log(req.body.email)
                        userModel.findOne({ email: req.body.email }, (err, users) => {
                            console.log(users)
                            if (!err) {
                                users.update({ profilePic: urlData[0] }, {}, function (err, data) {
                                    console.log(users)
                                    res.send({
                                        status: 200,
                                        message: "image uploaded",
                                        picture: users.profilePic
                                    });
                                })
                            }
                            else {
                                res.send({
                                    message: "error"
                                });
                            }
                        })
                        try {
                            fs.unlinkSync(req.files[0].path)

                        } catch (err) {
                            console.error(err)
                        }


                    }
                })
            } else {
                console.log("err: ", err)
                res.status(500).send();
            }
        });
})



const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log("server is running on: ", PORT);
})