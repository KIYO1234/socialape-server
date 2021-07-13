const functions = require("firebase-functions");
const express = require('express');
const app = express();
const FBAuth = require('./util/fbAuth');
const { db } = require('./util/admin');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
dayjs.extend(require('dayjs/plugin/timezone'))
dayjs.extend(require('dayjs/plugin/utc'))
dayjs.tz.setDefault('Asia/Tokyo');
dayjs.extend(utc);
const cors = require('cors');
app.use(cors());

const {
    getAllScreams,
    postOneScream,
    getScream,
    commentOnScream,
    likeScream,
    unlikeScream,
    deleteScream,
    fetchAllComments,
    fetchRelatedComments,
    fetchAllLikes,
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

// Scream routes
app.get('/screams', getAllScreams);
app.post('/scream', FBAuth, postOneScream);
app.get('/scream/:screamId', getScream);
app.post('/scream/:screamId/comment', FBAuth, commentOnScream)
app.delete('/scream/:screamId', FBAuth, deleteScream);
app.get('/scream/:screamId/like', FBAuth, likeScream);
app.get('/scream/:screamId/unlike', FBAuth, unlikeScream);
app.get('/comments', fetchAllComments);
app.get('/comments/:screamId', fetchRelatedComments);
app.get('/likes', fetchAllLikes);

// Users routes
app.post('/signup', signup);
app.post('/login', login);
app.post('/user/image', FBAuth, uploadImage);
app.post('/user', FBAuth, addUserDetails)
app.get('/user', FBAuth, getAuthenticatedUser);
app.get('/user/:handle', getUserDetails);
app.post('/notifications', FBAuth, markNotificationsRead);

exports.api = functions.region('asia-northeast1').https.onRequest(app);

exports.createNotificationOnLike = functions
  .region('asia-northeast1')
  .firestore.document('likes/{id}')
    .onCreate((snapshot) => {
        return db
        .doc(`/screams/${snapshot.data().screamId}`)
        .get()
            .then((doc) => {
                if (doc.exists && doc.data().userHandle !== snapshot.data().userHandle) {
                    return db
                        .doc(`/notifications/${snapshot.id}`)
                        .set({
                            createdAt: dayjs.tz().format(),
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
        return db
            .doc(`/screams/${snapshot.data().screamId}`)
            .get()
            .then((doc) => {
                if (
                    doc.exists &&
                    doc.data().userHandle !== snapshot.data().userHandle
                ) {
                    return db.doc(`/notifications/${snapshot.id}`).set({
                        createdAt: dayjs.tz().format(),
                        recipient: doc.data().userHandle,
                        sender: snapshot.data().userHandle,
                        type: 'comment',
                        read: false,
                        screamId: doc.id
                    });
                }
            })
            .catch((err) => {
                console.error(err);
                return;
            });
    });

exports.onUserImageChanged = functions
    .region('asia-northeast1')
    .firestore.document('/users/{userId}')
    .onUpdate((change) => {
        if (change.before.data().imageUrl !== change.after.data().imageUrl) {
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
                data.forEach(doc => {
                    batch.delete(db.doc(`/comments/${doc.id}`));
                });
                return db.collection('likes').where('screamId', '==', screamId).get();
            })
            .then(data => {
                data.forEach(doc => {
                    batch.delete(db.doc(`/likes/${doc.id}`));
                });
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

