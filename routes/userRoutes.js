import express from 'express'
import { registerUser, loginUser, userCredits, purchaseCreditsWithWaafi} from '../controllers/userContoller.js'
import userAuth from '../middlewares/auth.js'

const userRouter = express.Router()

userRouter.post('/register', registerUser)
userRouter.post('/login', loginUser)
userRouter.get('/credits', userAuth, userCredits)
userRouter.post('/payment', userAuth, purchaseCreditsWithWaafi)


export default userRouter



// http://localhost:4000/api/user/register
// http://localhost:4000/api/user/login
// http://localhost:4000/api/user/credits
// http://localhost:4000/api/user/payment
