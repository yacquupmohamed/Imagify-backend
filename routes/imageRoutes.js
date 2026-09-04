import express from 'express'

import userAuth from '../middlewares/auth.js'
import generateImage from '../controllers/imageContoller.js'

const imageRouter = express.Router()

imageRouter.post('/generate-image', userAuth, generateImage)

export default imageRouter