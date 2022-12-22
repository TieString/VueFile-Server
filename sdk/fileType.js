const mime = require('mime-types')
module.exports = function getFileMimeType(path) {
    const fileSuffix = path.split('.').pop().toLowerCase()
    const mimeType = mime.lookup(fileSuffix)
    return mimeType
}