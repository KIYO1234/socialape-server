// email, password, confirmPassword, handleが空じゃないことのバリデーション
const isEmpty = (string) => {
    // スペースだけの入力も空と判定する
    if (string.trim() === '') return true;
    else return false;
}
// emailが適切な形かのバリデーション（めんどいからカット）
// const isEmail = (email) => {
    
// }

exports.validateSignupData = (data) => {
    let errors = {};
    // email
    if (isEmpty(data.email)) {
        errors.email = 'Must not be empty'
    }
    //password
    if (isEmpty(data.password)) {
        errors.password = 'Must not be empty'
    }
    // confirmPassword
    if (data.password !== data.confirmPassword) {
        errors.confirmPassword = 'Passwords must match'
    }
    // handle
    if (isEmpty(data.handle)) {
        errors.handle = 'Must not be empty'
    }

    // if (Object.keys(errors).length > 0) {
    //     return res.status(400).json(errors);
    // }

    return {
        errors,
        valid: Object.keys(errors).length === 0 ? true : false
    }
}

exports.validateLoginData = (data) => {
    let errors = {};

    if (isEmpty(data.email)) {
        errors.email = 'Must not be empty';
    }
    if (isEmpty(data.password)) {
        errors.password = 'Must not be empty';
    }
    // if (Object.keys(errors).length > 0) {
    //     return res.status(400).json(errors);
    // }
    return {
        errors,
        valid: Object.keys(errors).length === 0 ? true : false
    }
}

exports.reduceUserDetails = (data) => {
    let userDetails = {};
    // bio
    if (!isEmpty(data.bio.trim())) {
        userDetails.bio = data.bio;
    }
    // if (!isEmpty(data.website.trim())) {
    //     // https://website.com
    //     // リクエストにhttps://が入っていなかった場合は付け加える
    //     if (data.website.trim().substring(0, 4) !== 'http') {
    //         userDetails.website = `https://${data.website.trim()}`;
    //     } else {
    //         userDetails.website = data.website 
    //     }
    // }

    // location
    if (!isEmpty(data.location.trim())) {
        userDetails.location = data.location;
    }

    return userDetails;
}