const { db, admin } = require('../util/admin');
const firebase = require('firebase');
const config = require('../util/config')
firebase.initializeApp(config);
const { validateSignupData, validateLoginData, reduceUserDetails } = require('../util/validators');

// Sign user up
exports.signup = (req, res) => {
    const newUser = {
        email: req.body.email,
        password: req.body.password,
        confirmPassword: req.body.confirmPassword,
        handle: req.body.handle,
    }
    const { valid, errors } = validateSignupData(newUser);
    // 空かどうかの判定
    if (!valid) {
        return res.status(400).json(errors);
    }
    // アイコン写真がなかったらstorageにあるperson.pngをアイコン画像に設定する
    const noImg = 'person.jpg'

    // todo: validate data（ユーザーの重複を防ぐ）
    let token, userId;
    db.doc(`/users/${newUser.handle}`).get()
        .then(doc => {
            if (doc.exists) {
                return res.status(400).json({handle: 'this handle is already taken'})
            } else {
                return firebase.auth().createUserWithEmailAndPassword(newUser.email, newUser.password)
            }  
        })
        .then(data => {
            userId = data.user.uid;
            return data.user.getIdToken();
        })
        .then(idToken => {
            token = idToken;
            const userCredentials = {
              handle: newUser.handle,
              email: newUser.email,
              createdAt: new Date().toISOString(),
              userId,
              imageUrl: `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${noImg}?alt=media&token=9e805cfb-0df4-42aa-8724-7b217eeb841d`,
            };
            // `/users/${newUser.handle}`.set()にすることで、handleに入っている文字列をidとしてsetできる
            db.doc(`/users/${newUser.handle}`).set(userCredentials);
            // return res.status(201).json({ token });
        })
        .then((data) => {
            return res.status(201).json({token})
        })
        .catch(err => {
            console.error(err);
            if (err.code === 'auth/email-already-in-use') {
                return res.status(400).json({email: 'Email is already in use'})
            }
            // return res.stats(500).json({ error: err.code });
            return res.stats(500).json({ general: 'Something went wrong, please try again' });
        })
    

    // firebase.auth().createUserWithEmailAndPassword(newUser.email, newUser.password)
    //     .then(data => {
    //         return res.status(201).json({ message: `user ${data.user.uid} signed up successfully` });
    //     })
    //     .catch(err => {
    //         console.error(err);
    //         if (err.code === "auth/email-already-in-use") {
    //              return res.status(400).json({email: "Email is already in use"})
    //         } else {
    //             return res.status(500).json({error: err.code})
    //         }
    //     })
}

// Log user in
exports.login = (req, res) => {
    // console.log(req.body)
    const user = {
        email: req.body.email,
        password: req.body.password
    };
    const { valid, errors } = validateLoginData(user);
    if (!valid) {
        console.log('invalid error', errors);
        return res.status(400).json(errors);
    }
    firebase
        .auth()
        .signInWithEmailAndPassword(user.email, user.password)
        .then(data => {
            // console.log(data.user.getIdToken())
            return data.user.getIdToken()
        })
        .then(token => {
            return res.json({ token })
        })
        .catch(err => {
            console.error('firebase error: ', err);
            // return res.status(500).json({error: err.code})
            return res
                .status(403)
                .json({ general: 'Wrong credentials, please try again' });
        });
    
}

// Add user details
exports.addUserDetails = (req, res) => {    
    let userDetails = reduceUserDetails(req.body);    
    db.doc(`users/${req.user.handle}`).update(userDetails)
        .then(() => {
            return res.json({ message: 'Details added successfully' })
        .catch(err => {
            console.error(err);
            return res.status(500).json({error: err.code})
        })
    })
}

// Get any user's details
exports.getUserDetails = (req, res) => {
    // console.log(req.body);
    
    let userData = {};
    db
        .doc(`/users/${req.params.handle}`)
        .get()
        .then(doc => {
            if (doc.exists) {
                userData.user = doc.data();
                return db
                    .collection('screams')
                    // screamsのuserHandleはTweetした本人
                    .where('userHandle', '==', req.params.handle)
                    .orderBy('createdAt', 'desc')
                    .get();
            } else {
                return res.json({ error: 'User not found' })
            }
        })
        .then(data => {
            userData.screams = [];
            data.forEach(doc => {
                userData.screams.push({
                    body: doc.data().body,
                    createdAt: doc.data().createdAt,
                    userHandle: doc.data().userHandle,
                    userImage: doc.data().userImage,
                    likeCount: doc.data().likeCount,
                    commentCount: doc.data().commentCount,
                    screamId: doc.id,
                })
            });
            return res.json(userData);
        })
        .catch(err => {
            console.error(err);
            return res.status(500).json({ error: err.code })
        });
}

// Get own user details
exports.getAuthenticatedUser = (req, res) => {
    // console.log(req.user.handle) // hello one
    let userData = {};
    db.doc(`/users/${req.user.handle}`).get()
        .then(doc => {
            // console.log(doc.data()) //ある
            if (doc.exists) {
                // console.log('あります')
                userData.credentials = doc.data();
                return db.collection('likes').where('userHandle', '==', req.user.handle).get();
            }
        })
        // ▼のdataはsnapshot
        .then(data => {            
            userData.likes = [];
            data.forEach(doc => {                
                userData.likes.push(doc.data());
            });
            // console.log(userData.likes)
            // return res.json(userData);
            // console.log(req.user.handle)
            // console.log(userData)
            
            return db
                .collection('notifications')
                .where('recipient', '==', req.user.handle)
                .orderBy('createdAt', 'desc').limit(10).get();
        })
        .then(data => {
            // console.log(data)
            
            userData.notifications = [];
            data.forEach(doc => {
                userData.notifications.push({
                    recipient: doc.data().recipient,
                    sender: doc.data().sender,
                    createdAt: doc.data().createdAt,
                    screamId: doc.data().screamId,
                    type: doc.data().type,
                    read: doc.data().read,
                    notificationId: doc.id,
                })
            });
            // console.log(userData)
            
            return res.json(userData);
        })
        .catch(err => {
            console.error(err);
            return res.status(500).json({ error: err.code });
        });
};

// Upload a profile image for user
exports.uploadImage = (req, res) => {
    console.log('uploadImage', req.body)
    
    const BusBoy = require('busboy');
    const path = require('path');
    const os = require('os');
    const fs = require('fs');

    const busboy = new BusBoy({ headers: req.headers })

    let imageFileName;
    let imageToBeUploaded = {};

    busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
        // ユーザーがアップロードしたファイルが.jpeg / .png 以外の時は弾きたい
        if (mimetype !== 'image/jpeg/jpg' && mimetype !== 'image/png') {
            return res.status(400).json({error: 'Wrong file type submitted'})
        }
        
        // my.img.png となっていたら png だけとりたい
        const imageExtension = filename.split('.')[filename.split('.').length - 1];

        // png だけ取り出したのとsplitしたfilename(imgの部分)をconcatする
        // 343545345242.pngになる
        // imageFileName = `${Math.round(Math.random() * 10000000000)}.${imageExtension}`;
        imageFileName = `${req.body}.${imageExtension}`;

        const filepath = path.join(os.tmpdir(), imageFileName);

        imageToBeUploaded = { filepath, mimetype };

        // node.jsのメソッド
        file.pipe(fs.createWriteStream(filepath));

    })
    // uploadの作業
    busboy.on('finish', () => {
        admin.storage().bucket().upload(imageToBeUploaded.filepath, {
            resumable: false,
            metadata: {
                metadata: {
                    contentType: imageToBeUploaded.mimetype
                }
            }
        })
        .then(() => {
            const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${imageFileName}?alt=media`

            return db.doc(`/users/${req.user.handle}`).update({ imageUrl: imageUrl })
            // ({imageUrl})だけでもOK
        })
            .then(() => {
                return res.json({ message: 'Image uploaded successfully' });
            })
            .catch(err => {
                console.error(err);
                return res.status(500).json({error: err.code})
        })
    })
    busboy.end(req.rawBody)

}

exports.markNotificationsRead = (req, res) => {
    let batch = db.batch();
    req.body.forEach(notificationId => {
        const notification = db.doc(`/notifications/${notificationId}`);
        // batch().update(DocumentReference, updateData)
        // Update fields of the document referred to by the provided DocumentReference. If the document doesn't yet exist, the update fails and the entire batch will be rejected.
        batch.update(notification, { read: true });
    });
    // batch().commit()▼
    // (method) FirebaseFirestore.WriteBatch.commit(): 引数なしPromise<FirebaseFirestore.WriteResult[]>を返す
    // Commits all of the writes in this write batch as a single atomic unit.
    batch.commit()
        .then(() => {
            return res.json({ message: 'Notifications marked read' });
        })
        .catch(err => {
            console.error(err);
            return res.status(500).json({ error: err.code });
        });
};