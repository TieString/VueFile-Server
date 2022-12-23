const { sleep } = require('./file')

const router = require('express').Router(),
    multer = require('multer'),
    path = require('path'),
    mime = require('mime'),
    fs = require('fs')

module.exports = function (storages, options = {}) {
    let uploadPath = options.uploadPath || require('os').tmpdir()
    for (let storage of storages) {
        // `list` endpoint
        router.get(`/${storage.code}/list`, async function (req, res) {
            let result = await storage.list(req.query.path)
            return res.json(result)
        })

        // `upload` endpoint
        router.post(`/${storage.code}/upload`, multer({ dest: uploadPath }).array('files'), async function (req, res) {
            await storage.upload(req.query.path, req.files)
            return res.sendStatus(200)
        })

        // `download` endpoint
        router.get(`/${storage.code}/download`, async function (req, res) {
            await storage.download(req, res)
        })

        // `mkdir` endpoint
        router.post(`/${storage.code}/mkdir`, async function (req, res) {
            await storage.mkdir(req.query.path, req.query.name)
            return res.sendStatus(200)
        })

        // `delete` endpoint
        router.post(`/${storage.code}/delete`, async function (req, res) {
            await storage.delete(req.query.path)
            return res.sendStatus(200)
        })

        /* 断点续传 */
        router.post(`/${storage.code}/multipartyUpload`, (req, res, next) => {
            let { hash, name, type } = req.query
            let dir = `${path.join(__dirname, '../')}upload/${hash}`
            // 文件是否已经上传过
            let realPath = `${dir}.${mime.extension(type)}`
            if (fs.existsSync(realPath)) {
                res.status(200).json({ realPath, msg: '文件已存在，无需上传！' })
                return
            }
            // 切片路径 判断切片是否上传过
            let chunkPath = `${dir}/${name}`
            if (fs.existsSync(chunkPath)) {
                res.status(200).json({ chunkPath, msg: '切片已存在，跳过此切片' })
            } else {
                storage
                    .multipartyUploadFile(req)
                    .then((value) => {
                        res.status(200).json(value)
                    })
                    .catch((reason) => {
                        res.status(500).json(reason)
                    })
            }
        })

        // 合并文件
        router.get(`/${storage.code}/upload/merge`, async (req, res, next) => {
            await sleep(1000)
            let { hash, type } = req.query
            let dir = `${path.join(__dirname, '../')}upload/${hash}`
            // 文件是否已经上传过
            let realPath = `${dir}.${mime.extension(type)}`
            // try {
            //     if (fs.existsSync(realPath)) {
            //         res.status(200).json({ realPath, msg: '文件已存在，无需合并！' })
            //         return
            //     }
            // } catch {
            let fileList = fs.readdirSync(dir)
            fileList.sort((a, b) => a - b)
            fileList.forEach((item) => {
                fs.appendFileSync(`${dir}.${mime.extension(type)}`, fs.readFileSync(`${dir}/${item}`))
                fs.unlinkSync(`${dir}/${item}`)
            })
            fs.rmdirSync(dir)
            res.status(200).json({ path: `${dir}.${mime.extension(type)}`, msg: '合并成功！' })
            // }
        })
    }
    return router
}
