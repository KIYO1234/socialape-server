const functions = require("firebase-functions");
const express = require('express');
const app = express();
const FBAuth = require('./util/fbAuth');
const { db } = require('./util/admin')

const {
    getAllScreams,
    postOneScream,
    getScream,
    commentOnScream,
    likeScream,
    unlikeScream,
    deleteScream,
    getAllComments,
    fetchAllComments,
} = require('./handlers/screams');
const {
    signup,
    login,
    uploadImage,
    addUserDetails,
    getAuthenticatedUser,
    getUserDetails,
    markNotificationsRead
} = require('./handlers/users')


// const config = require('./util/config')
// const firebase = require('firebase');
// firebase.initializeApp(config);

// Scream routes
app.get('/screams', getAllScreams);
app.post('/scream', FBAuth, postOneScream);
app.get('/scream/:screamId', getScream);
app.post('/scream/:screamId/comment', FBAuth, commentOnScream)
app.delete('/scream/:screamId', FBAuth, deleteScream);
app.get('/scream/:screamId/like', FBAuth, likeScream);
app.get('/scream/:screamId/unlike', FBAuth, unlikeScream);
// Get all comments（ログインしてなくても見れるようにFBAuthは付けない）
// app.get('/scream/:screamId/comments', getAllComments);
// pathを'/scream/comments'にすると、comments部分が:screamIdだと認識されてしまう→pathを'/comments'に変更
app.get('/comments', fetchAllComments);

// Users routes
app.post('/signup', signup);
app.post('/login', login);
// 自分しか画像をアップロードできないようにFBAuthをかませる
// FBAuthをかませるとTokenをゲットできる
app.post('/user/image', FBAuth, uploadImage);
app.post('/user', FBAuth, addUserDetails)
app.get('/user', FBAuth, getAuthenticatedUser);
// FBAuthついてないものはpublic
app.get('/user/:handle', getUserDetails);
app.post('/notifications', FBAuth, markNotificationsRead);

// https://baseurl.com/screams ではなく↓
// https://baseurl.com/api/~~~の形にしたい（API通信した時はパスにapiを入れたい）=> exports.apiとする
// region()でロケーションを変更可能（us-centralは遠すぎて通信が遅くなる）
exports.api = functions.region('asia-northeast1').https.onRequest(app);

exports.createNotificationOnLike = functions
  .region('asia-northeast1')
  .firestore.document('likes/{id}')
  .onCreate((snapshot) => {
    return db
      .doc(`/screams/${snapshot.data().screamId}`)
      .get()
        .then((doc) => {
        // 自分のscreamをlikeした時には通知を送らない
        if (doc.exists && doc.data().userHandle !== snapshot.data().userHandle) {
          return db.doc(`/notifications/${snapshot.id}`).set({
            createdAt: new Date().toISOString(),
            recipient: doc.data().userHandle,
            sender: snapshot.data().userHandle,
            type: 'like',
            read: false,
            screamId: doc.id
          });
        }
      })
      .catch((err) => console.error(err));
  });

exports.deleteNotificationOnUnlike = functions
    .region('asia-northeast1')
    .firestore.document('likes/{id}')
    .onDelete(snapshot => {
        return db
            .doc(`/notifications/${snapshot.id}`)
            .delete()
            .catch(err => {
                console.error(err);
                return;
            });
    });

exports.createNotificationOnComment = functions
    .region('asia-northeast1')
    .firestore.document('comments/{id}')
    .onCreate((snapshot) => {
        db.doc(`/screams/${snapshot.data().screamId}`).get()
            .then(doc => {
                // 自分のscreamをlikeした時には通知を送らない
                if (doc.exists && doc.data().userHandle !== snapshot.data().userHandle) {
                    return db.doc(`/notifications/${snapshot.id}`).set({
                        createdAt: new Date().toISOString(),
                        recipient: doc.data().userHandle,
                        sender: snapshot.data().userHandle,
                        type: 'comment',
                        read: false,
                        screamId: doc.id,
                    });
                }
            })
            .catch(err => {
                console.error(err);
                return;
            })
        
    });

// ユーザーがプロフィール画像を変更した時にscreamsの画像も変更するtriggerを作る
exports.onUserImageChanged = functions
    .region('asia-northeast1')
    .firestore.document('/users/{userId}')
    .onUpdate((change) => {
        console.log(change.before.data());
        console.log(change.after.data());
        // imageUrlが変わった時にだけ実行する
        if (change.before.data().imageUrl !== change.after.data().imageUrl) {
            console.log('image has changed');
            const batch = db.batch();
            return db
                .collection('screams')
                .where('userHandle', '==', change.before.data().handle).get()
                .then((data) => {
                    data.forEach(doc => {
                        const scream = db.doc(`/screams/${doc.id}`);
                        batch.update(scream, { userImage: change.after.data().imageUrl });
                    })
                    return batch.commit();
                });
        } else {
            return true
        }
    });

// ユーザーがscreamを削除した場合、notificationsやlikeなどの関連要素も削除する
exports.onScreamDelete = functions
    .region('asia-northeast1')
    .firestore.document('/screams/{screamId}')
    .onDelete((snapshot, context) => {
        const screamId = context.params.screamId;
        const batch = db.batch();
        return db
            .collection('comments')
            .where('screamId', '==', screamId)
            .get()
            .then(data => {
                // commentsを削除
                data.forEach(doc => {
                    batch.delete(db.doc(`/comments/${doc.id}`));
                });
                // likesの中からscreamIdが被るものをreturn→次のthenにつなぐ
                return db.collection('likes').where('screamId', '==', screamId).get();
            })
            .then(data => {
                // ▲dataにはlikesの中からscreamIdが同じものを抽出したものが入る
                // likesをforEach()で削除
                data.forEach(doc => {
                    batch.delete(db.doc(`/likes/${doc.id}`));
                });
                // notificationsにつなげる
                return db.collection('notifications').where('screamId', '==', screamId).get();
            })
            .then(data => {
                data.forEach(doc => {
                    batch.delete(db.doc(`/notifications/${doc.id}`));
                });
                return batch.commit();
            })
            .catch(err => console.error(err));
    });



// // exports.getScreams = ... => app.get('/screams', ()=>{})の形に変更：expressを入れたからできること
// exports.getScreams = functions.https.onRequest((req, res) => {
//     // admin.firestore().collection('screams').get().then(snapshot => {
//         //     let screams = [];
//         //     snapshot.forEach(doc => {
//             //         screams.push(doc.data())
//             //     });
//             //     return res.json(screams);
//             // })
//             // .catch(err => console.error(err))
// })
        
// // exports.getScreams = ... => app.get('/screams', ()=>{})の形に変更：expressを入れたからできること
// app.get('/screams', (req, res) => {
//     // admin.firestore().collection('screams').orderBy('createdAt', 'desc').get().then(snapshot => {
//     db.collection('screams').orderBy('createdAt', 'desc').get().then(snapshot => {
//         let screams = [];
//         snapshot.forEach(doc => {
//             // idを同時に追加しておく
//             // screams.push(doc.data())
//             screams.push({
//                 screamId: doc.id,
//                 body: doc.data().body,
//                 userHandle: doc.data().userHandle,
//                 createdAt: doc.data().createdAt
//             })
//         });
//         return res.json(screams);
//     })
//     .catch(err => console.error(err))
// })

        
// Post one scream
// exports.createScreamをexpressで書き換え
// exports.createScream = functions.https.onRequest((req, res) => {

