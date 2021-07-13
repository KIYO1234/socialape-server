const { _refWithOptions } = require('firebase-functions/lib/providers/database');
const { defaultDatabase } = require('firebase-functions/lib/providers/firestore');
const { db } = require('../util/admin')
// const firebase = require('firebase')
const { axios } = require('axios');

// dayjs
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
dayjs.extend(require('dayjs/plugin/timezone'))
dayjs.extend(require('dayjs/plugin/utc'))
dayjs.tz.setDefault('Asia/Tokyo');
dayjs.extend(utc);
dayjs.tz.setDefault('Asia/Tokyo')
console.log('time', dayjs.tz().format());

exports.getAllScreams = (req, res) => {    
    // admin.firestore().collection('screams').orderBy('createdAt', 'desc').get().then(snapshot => {
    db
        .collection('screams')
        .orderBy('createdAt', 'desc')
        .get()
        .then(snapshot => {
            let screams = [];
            snapshot.forEach(doc => {
                // idを同時に追加しておく
                // screams.push(doc.data())
                screams.push({
                  screamId: doc.id,
                  body: doc.data().body,
                  userHandle: doc.data().userHandle,
                  createdAt: doc.data().createdAt,
                  commentCount: doc.data().commentCount,
                  likeCount: doc.data().likeCount,
                  userImage: doc.data().userImage,
                })
            });
            return res.json(screams);
        })
        .catch(err => console.error(err))
}

exports.postOneScream = (req, res) => {    
    // app.postにしたらpostが確定なので下のがいらなくなる▼
    // if (req.method !== 'POST') {
    //     return res.status(400).json({error: 'Method is incorrect'})
    // }

    // post を受け取っているはず
    const newScream = {
      body: req.body.body,
      // userHandle: req.body.userHandle,
      userHandle: req.user.handle,
      // createdAt: admin.firestore.Timestamp.fromDate(new Date())
      // createdAt: new Date().toISOString(),
      createdAt: dayjs.tz().format(),
      userImage: req.user.imageUrl,
      likeCount: 0,
      commentCount: 0,
      //追記
      isLikedByUser: false,
    }
    // admin.firestore()
    db
        .collection('screams')
        .add(newScream)
        .then(doc => {
            const resScream = newScream;
            resScream.screamId = doc.id;
            // res.json({ message: `document ${doc.id} created successfully!` })
            res.json(resScream)
        })
        .catch(err => {
            res.status(500).json({ error: 'something went wrong' });
            console.error(err);
        })
}

// Fetch one scream
exports.getScream = (req, res) => {
    let screamData = {};
    // パラメーターが欲しいときはreq.params
    db.doc(`/screams/${req.params.screamId}`).get()
        .then(doc => {
            if (!doc.exists) {
                return res.status(404).json({ error: 'Scream not found' });
            };
            screamData = doc.data();
            screamData.screamId = doc.id;
            return db
                .collection('comments')
                .orderBy('createdAt', 'desc')
                .where('screamId', '==', req.params.screamId)
                .get()
        })
        .then(data => {
            screamData.comments = [];
            data.forEach(doc => {
                screamData.comments.push(doc.data())
            });
            return res.json(screamData)
        })
        .catch(err => {
            console.error(err);
            res.status(500).json({ error: err.code })
        });
}

// Comment on a scream
exports.commentOnScream = (req, res) => {
  // const body = JSON.parse(req.body)
  // console.log(body.body)
  console.log('commentOnScream.body', req.body);
  // console.log('commentOnScream.scream', req.scream);
  // console.log('time', dayjs.tz().format());
  
  if (req.body.body.trim() === '') {
    return res.status(400).json({ comment: 'Must not be empty'})
  };
  const newComment = {
    body: req.body.body,
    // createdAt: new Date().toISOString(),
    createdAt: dayjs.tz().format(),
    screamId: req.params.screamId,
    userHandle: req.user.handle,
    userImage: req.user.imageUrl
  };

  db.doc(`/screams/${req.params.screamId}`).get()
    .then(doc => {            
        if (!doc.exists) {
            return res.status(404).json({ error: 'Scream not found' });
        }
        // return db.collection('comments').add(newComment)
        
        return doc.ref.update({commentCount: doc.data().commentCount + 1})
    })
    .then(() => {
        return db.collection('comments').add(newComment)
    })
    .then(() => {
        res.json(newComment);
    })
    .then(() => {
      const notification = {
        createdAt: dayjs.tz().format(),
        read: false,
        recipient: req.body.scream.userHandle,
        screamId: req.body.scream.screamId,
        sender: req.body.sender,
        type: 'comment'
      }
      db.collection('/notifications').add(notification)
        .then(snapshot => {
          console.log('notifications snapshot: ', snapshot)
        });
    })
    .catch(err => {
        console.log(err);
        res.status(500).json({ error: 'Something went wrong' });
    })
}

// // Get all comments
// exports.getAllComments = async(req, res) => {
//   console.log('getAllComments', req.params.screamId);
//   const screamId = req.params.screamId;
//   const comments = [];
//   await db
//     .collection('comments')
//     .where('screamId', '==', screamId)
//     .orderBy('createdAt', 'desc')
//     .get()
//     .then(snapshot => snapshot.forEach(doc => {
//       console.log(doc.data());
//       comments.push(doc.data());
//     }))
//     .catch(err => {
//       res.status(500).json({ error: err.code });
//     });
  
//   console.log('comments', comments);
//   return res.json(comments);
// };

// Fetch All Comments
exports.fetchAllComments = async (req, res) => {
  const comments = [];
  await db
    .collection('comments')
    .orderBy('createdAt', 'desc')
    .get()
    .then(snapshot => snapshot.forEach(doc => {
      comments.push(doc.data());
    }))
    .catch(err => {
      res.status(500).json({ error: err.code });
    });
  return res.json(comments);
};

// Fetch related comments
exports.fetchRelatedComments = async (req, res) => {
  console.log('fetchRelatedComments', req.params);
  const screamId = req.params.screamId;
  let screams = [];
  await db
    .collection('/comments')
    .orderBy('createdAt', 'desc')
    .where('screamId', '==', screamId)
    .get()
    .then(snapshot => snapshot.forEach(
      doc => screams.push(doc.data())
    ));
  // console.log('screams', screams)
  return res.json(screams);
}

// Fetch all likes
exports.fetchAllLikes = async (req, res) => {
  let likes = []
  await db
    .collection('likes')
    .get()
    .then(snapshot => snapshot.forEach(doc =>
      likes.push(doc.data())
    ))
  return res.json(likes);
}

// Like a scream
exports.likeScream = (req, res) => {    
    const likeDocument = db.collection('likes').where('userHandle', '==', req.user.handle)
        .where('scramId', '==', req.params.screamId).limit(1);
    
    const screamDocument = db.doc(`/screams/${req.params.screamId}`);

    let screamData;

    screamDocument.get()
        .then(doc => {
            if (doc.exists) {
                screamData = doc.data();
                screamData.screamId = doc.id;
                return likeDocument.get();
            } else {
                return res.status(404).json({ error: 'Scream not found' });
            };
        })
        .then(data => {
            // console.log(data)
            if (data.empty) {
                return db.collection('likes').add({
                    screamId: req.params.screamId,
                    userHandle: req.user.handle
                })
                    .then(() => {
                        screamData.likeCount++
                      return screamDocument.update(
                        {
                          likeCount: screamData.likeCount,
                        }
                      )
                    })
                    .then(() => {
                        return res.json(screamData);
                    })
            } else {
                return res.status(400).json({ error: 'Scream already liked' });
            }
        })
        .catch(err => {
            res.status(500).json({ error: err.code });
        });
};

exports.unlikeScream = (req, res) => {    
  const likeDocument = db
    .collection('likes')
    .where('userHandle', '==', req.user.handle)
    .where('screamId', '==', req.params.screamId)
    // .limit(1);
    
  const screamDocument = db.doc(`/screams/${req.params.screamId}`);  
    
  let screamData;

  screamDocument
    .get()
      .then((doc) => {
          
          if (doc.exists) {
              screamData = doc.data();
              screamData.screamId = doc.id;
            //   console.log(screamData) // OK
        return likeDocument.get();
      } else {
        return res.status(404).json({ error: 'Scream not found' });
      }
    })
      .then((data) => {
        // console.log(data)  // snapshot
      if (data.empty) {
        return res.status(400).json({ error: 'Scream not liked' });
      } else {
        //   console.log(data.docs[0])
          
        return db
          .doc(`/likes/${data.docs[0].id}`)
          .delete()
          .then(() => {
            screamData.likeCount--;
            return screamDocument.update(
              {
                likeCount: screamData.likeCount,
              }
            );
          })
          .then(() => {
            res.json(screamData);
          });
      }
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: err.code });
    });
};

// Delete a scream
exports.deleteScream = (req, res) => {
    // console.log(req.params.screamId)
    
  const document = db.doc(`/screams/${req.params.screamId}`);
  document
    .get()
    .then((doc) => {
      if (!doc.exists) {
        return res.status(404).json({ error: 'Scream not found' });
      }
      if (doc.data().userHandle !== req.user.handle) {
        return res.status(403).json({ error: 'Unauthorized' });
      } else {
        return document.delete();
      }
    })
    .then(() => {
      res.json({ message: 'Scream deleted successfully' });
    })
    .catch((err) => {
      console.error(err);
      return res.status(500).json({ error: err.code });
    });
};
