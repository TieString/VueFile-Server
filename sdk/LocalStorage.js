const os = require('os'),
    nodePath = require('path'),
    fs = require('fs'),
    fsPromises = require('fs').promises,
    readdir = fsPromises.readdir,
    stat = fsPromises.stat,
    rename = fsPromises.rename,
    unlink = fsPromises.unlink,
    lstat = fsPromises.lstat,
    util = require('util'),
    rimraf = util.promisify(require('rimraf')),
    getFileMimeType = require('./file'),
    multiparty = require('multiparty'),
    path = require('path')

class LocalStorage {
    constructor(root) {
        this.code = 'local'
        if (root) {
            this.root = root
        } else if (process.env.FILEBROWSER_LOCAL_ROOT_PATH) {
            this.root = nodePath.resolve(process.cwd(), process.env.FILEBROWSER_LOCAL_ROOT_PATH)
        } else {
            this.root = os.homedir()
        }
    }

    async list(path) {
        try {
            let dirs = [],
                files = []

            if (path[path.length - 1] !== '/') {
                path += '/'
            }
            let items = await readdir(this.root + path, { withFileTypes: true })

            for (let item of items) {
                let isFile = item.isFile(),
                    isDir = item.isDirectory()

                if (!isFile && !isDir) {
                    continue
                }

                let result = {
                    type: isFile ? 'file' : 'dir',
                    path: path + item.name,
                }

                result.basename = result.name = nodePath.basename(result.path)

                if (isFile) {
                    let fileStat = await stat(this.root + result.path)
                    result.size = fileStat.size
                    result.extension = nodePath.extname(result.path).slice(1)
                    result.name = nodePath.basename(result.path, '.' + result.extension)
                    files.push(result)
                } else {
                    result.path += '/'
                    dirs.push(result)
                }
            }

            return dirs.concat(files)
        } catch (err) {
            console.error(err)
        }
    }

    async upload(path, files) {
        try {
            for (let file of files) {
                await rename(file.path, this.root + path + file.originalname)
            }
        } catch (err) {
            console.error(err)
        }
    }

    // 下载
    async download(req, res) {
        try {
            const fullPath = this.root + req.query.path
            const stat = await lstat(fullPath)
            if (stat.isFile()) {
                const range = req.headers.range
                if (!range) {
                    await res.download(fullPath)
                    return
                }
                /* 开始断点续传 */
                // 解析 HTTP Range 请求头，获取文件范围
                const parts = range.replace(/bytes=/, '').split('-')
                const start = parseInt(parts[0], 10)
                const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
                const chunksize = end - start + 1

                // 读取文件，并返回指定范围的内容
                const file = fs.createReadStream(file, { start, end })
                res.writeHead(206, {
                    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunksize,
                    'Content-Type': 'text/plain',
                })
                file.pipe(res)

                app.listen(3000, () => {
                    console.log('Server is listening on port 3000')
                })
            } else {
                throw new Error(`Cannot download a directory: ${path}`)
            }
        } catch (err) {
            console.error(err)
        }
    }

    async mkdir(path) {
        await fsPromises.mkdir(this.root + path, { recursive: true })
    }

    async delete(path) {
        try {
            let stat = await lstat(this.root + path),
                isDir = stat.isDirectory(),
                isFile = stat.isFile()

            if (isFile) {
                await unlink(this.root + path)
            } else if (isDir) {
                await rimraf(this.root + path)
            }
        } catch (err) {
            console.error(err)
        }
    }

    /* 断点续传 */
    /**
     * 文件上传
     * @param {Object} req 客户端传入参数
     */
    multipartyUploadFile = async (req) => {
        try {
            let { hash, name } = req.query
            let form = new multiparty.Form({})
            form.uploadDir = 'upload'
            let { fields, files } = await new Promise((resolve, reject) => {
                form.parse(req, (err, fields, files) => {
                    if (err) return reject(err)
                    return resolve({ fields, files })
                })
            })
            let file = files.file[0]
            let dir = `${path.join(__dirname, '../')}upload/${hash}`
            if (!fs.existsSync(dir)) {
                try {
                    fs.mkdirSync(dir)
                } catch (err) {
                    throw new Error(`Failed to create directory ${dir}: ${err}`)
                }
            }
            let savePath = `${dir}/${name}`
            try {
                fs.renameSync(file.path, savePath)
            } catch (err) {
                throw new Error(`Failed to move file from ${file.path} to ${savePath}: ${err}`)
            }
            file.realPath = savePath
            return { fields, files }
        } catch (err) {
            console.error(err)
            throw err
        }
    }
}

module.exports = LocalStorage
