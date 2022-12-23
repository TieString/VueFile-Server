const mime = require('mime-types')
module.exports = {
    getFileMimeType: function (path) {
        const fileSuffix = path.split('.').pop().toLowerCase()
        const mimeType = mime.lookup(fileSuffix)
        return mimeType
    },
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms))
    },
}
