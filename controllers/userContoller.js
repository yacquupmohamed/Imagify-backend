import userModel from "../models/userModel.js";
import bcrypt from 'bcrypt'
import jwb from 'jsonwebtoken'
import transactionModel from "../models/transactionModel.js";
import axios from 'axios';
import dotenv from "dotenv"

dotenv.config()




const registerUser = async (req, res)=>{
    try{
        const {name, email, password} = req.body;

        if(!name || !email || !password){
            return res.json({success:false, message: 'Missing Detials'})
        }
        const salt = await bcrypt.genSalt(10)
        const hashedPassword = await bcrypt.hash(password, salt)

        const userData = {
            name,
            email,
            password: hashedPassword
        }

        const newUser = new userModel(userData)
        const user = await newUser.save()

        const token = jwb.sign({id: user._id}, process.env.JWT_SECRET)

        res.json({success: true, token, user: {name: user.name}})


    }catch(error){
        console.log(error);
        res.json({success: false, message: error.message})
    };
    
}
const loginUser = async (req, res)=>{
    try{
        const {email, password} = req.body;
        const user = await userModel.findOne({email})

        if(!user){
            return res.json({success:false, message: 'User does not exist'})
        }

        const isMatch = await bcrypt.compare(password, user.password)

        if(isMatch){
            const token = jwb.sign({id: user._id}, process.env.JWT_SECRET)

            res.json({success: true, token, user: {name: user.name}})
        }else{
            return res.json({success:false, message: 'Invalid credentials'})
        }
    }catch(error){
        console.log(error);
        res.json({success: false, message: error.message})
    }
}

const userCredits = async (req, res)=>{
    try{
        const {userId} = req.body

        const user = await userModel.findById(userId)
        res.json({success: true, credits: user.creditBalance, user: {name: user.name}})
    }catch(error){
        console.log(error);
        res.json({success: false, message: error.message})
    }
}





// WaafiPay API credentials (use environment variables)
const MERCHANT_UID = process.env.WAAFI_MERCHANT_UID ;
const API_USER_ID = process.env.WAAFI_API_USER_ID ;
const API_KEY = process.env.WAAFI_API_KEY ;
const BASE_URL = "https://api.waafipay.net/asm";

// Helper function to generate unique IDs
const generateRequestId = () => `req_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

// Helper to clean phone numbers
const cleanPhoneNumber = (phone) => {
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.startsWith('252') ? cleaned : `252${cleaned}`;
};

// Main payment function
const purchaseCreditsWithWaafi = async (req, res) => {
  try {
    const { userId, planId, phone } = req.body;

    // Validate required fields
    if (!userId || !planId || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: userId, planId, phone'
      });
    }

    // Find user
    const user = await userModel.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Determine credit plan
    let credits, amount, plan;
    switch (planId) {
      case 'Basic':
        plan = 'Basic';
        credits = 5;
        amount = 0.01;
        break;
      case 'Advanced':
        plan = 'Advanced';
        credits = 500;
        amount = 50;
        break;
      case 'Business':
        plan = 'Business';
        credits = 5000;
        amount = 250;
        break;
      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid credit plan'
        });
    }

    // Create initial transaction record
    const transaction = await transactionModel.create({
      userId,
      plan,
      amount,
      credits,
      date: Date.now(),
      status: 'pending'
    });

    // Process payment with WaafiPay
    const paymentResult = await processWaafiPayment(phone, amount);

    // Handle payment result
    if (!paymentResult.success) {
      transaction.status = 'failed';
      transaction.waafiTransactionId = paymentResult.transactionId;
      await transaction.save();
      
      return res.status(402).json({
        success: false,
        message: paymentResult.message,
        transactionId: paymentResult.transactionId
      });
    }

    // Update transaction on success
    transaction.status = 'completed';
    transaction.waafiTransactionId = paymentResult.transactionId;
    await transaction.save();

    // Update user credits
    user.creditBalance += credits;
    await user.save();

    return res.json({
      success: true,
      message: 'Credits purchased successfully',
      creditsAdded: credits,
      transactionId: paymentResult.transactionId
    });

  } catch (error) {
    console.error('Payment error:', error);
    return res.status(500).json({
      success: false,
      message: error.response?.data?.params?.description || 
             error.message || 
             'Internal server error'
    });
  }
};

// WaafiPay processing helper
async function processWaafiPayment(phone, amount) {
  try {
    const requestId = generateRequestId();
    const timestamp = new Date().toISOString();
    const accountNo = cleanPhoneNumber(phone);

    // Step 1: Preauthorize
    const preauthorizeBody = {
      schemaVersion: "1.0",
      requestId: requestId,
      timestamp: timestamp,
      channelName: "WEB",
      serviceName: "API_PREAUTHORIZE",
      serviceParams: {
        merchantUid: MERCHANT_UID,
        apiUserId: API_USER_ID,
        apiKey: API_KEY,
        paymentMethod: "MWALLET_ACCOUNT",
        payerInfo: { accountNo },
        transactionInfo: {
          referenceId: `ref_${Date.now()}`,
          invoiceId: `INV_${Date.now()}`,
          amount: amount,
          currency: "USD",
          description: "Credit Purchase"
        }
      }
    };

    const preauthResponse = await axios.post(BASE_URL, preauthorizeBody);
    const preauthData = preauthResponse.data;

    if (preauthData.responseCode !== "2001") {
      return {
        success: false,
        message: preauthData.params?.description || "Payment authorization failed",
        transactionId: preauthData.params?.transactionId || ""
      };
    }

    const transactionId = preauthData.params.transactionId;

    // Step 2: Commit transaction
    const commitBody = {
      schemaVersion: "1.0",
      requestId: generateRequestId(),
      timestamp: new Date().toISOString(),
      channelName: "WEB",
      serviceName: "API_PREAUTHORIZE_COMMIT",
      serviceParams: {
        merchantUid: MERCHANT_UID,
        apiUserId: API_USER_ID,
        apiKey: API_KEY,
        paymentMethod: "MWALLET_ACCOUNT",
        transactionId: transactionId,
        description: "Credit Purchase"
      }
    };

    const commitResponse = await axios.post(BASE_URL, commitBody);
    const commitData = commitResponse.data;

    if (commitData.responseCode !== "2001") {
      return {
        success: false,
        message: commitData.params?.description || "Payment completion failed",
        transactionId: transactionId
      };
    }

    return {
      success: true,
      message: "Payment processed successfully",
      transactionId: transactionId
    };

  } catch (error) {
    console.error('WaafiPay processing error:', error.response?.data || error.message);
    return {
      success: false,
      message: error.response?.data?.params?.description || "Payment processing failed",
      transactionId: ""
    };
  }
}





export {registerUser, loginUser, userCredits  , purchaseCreditsWithWaafi} 
