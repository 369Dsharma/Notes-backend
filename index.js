require("dotenv").config();

const mongoose = require("mongoose");

mongoose.connect(process.env.MONGODB_URI)
    .then((res)=>{
        console.log("Connected to DB");
    })
    .catch((err)=>{
        console.log("Error in connecting to DB",err);
    });

const User = require("./models/user.model");
const Note = require("./models/note.model");

const express = require("express");
const cors = require("cors");
const app = express();
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const {authenticateToken} = require("./utilities");
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const OtpToken = require("./models/otpToken.model");
const { sendOtpMail } = require("./utils/mailer");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS configuration
app.use(cors({
    origin: "*",
}));

app.get("/", (req,res)=>{
    res.json({data: "hello"});
});

// Create Account
app.post("/create-account", async (req, res) => {
  try {
    console.log("Request body:", req.body); 
    
    const { fullName, email, password } = req.body;

    if (!fullName) {
      return res
        .status(400)
        .json({ error: true, message: "Full Name is required" });
    }

    if (!email) {
      return res.status(400).json({ error: true, message: "Email is required" });
    }

    if (!password) {
      return res
        .status(400)
        .json({ error: true, message: "Password is required" });
    }

    const isUser = await User.findOne({email : email});

    if(isUser) {
      return res.status(400).json({
        error: true,
        message: "User already exists",
      });
    }

    if (!process.env.ACCESS_TOKEN_SECRET) {
      return res.status(500).json({
        error: true,
        message: "Server configuration error - ACCESS_TOKEN_SECRET not found",
      });
    }

    const user = new User({
      fullName,
      email,
      password,
    });

    await user.save();

    const accessToken = jwt.sign({user}, process.env.ACCESS_TOKEN_SECRET, {
      expiresIn : "36000m",
    });

    return res.json({
      error: false,
      user,
      accessToken,
      message: "Registration Successful",
    });

  } catch (error) {
    console.error("Error in /create-account:", error);
    return res.status(500).json({
      error: true,
      message: "Internal server error",
    });
  }
});

//login api

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  if (!password) {
    return res.status(400).json({ message: "Password is required" });
  }

  const userInfo = await User.findOne({ email: email });

  if (!userInfo) {
    return res.status(400).json({ message: "User not found" });
  }

  if(userInfo.email == email && userInfo.password == password)
  {
    const user = {user : userInfo};
    const accessToken = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET,{
      expiresIn: "36000m",
    });

    return res.json({
      error: false,
      message : "Login Successful",
      email,
      accessToken,
    });
  }
  else{
    return res.status(400).json({
      error: true,
      message: "Email or Password is incorrect",
    });
  }
});

// Get User

app.get("/get-user" , authenticateToken,  async (req,res)=>{
  const {user} = req.user;

  const isUser = await User.findOne({ _id: user._id });

  if (!isUser) {
    return res.sendStatus(401);
  }

  return res.json({
    user: {
      fullName: isUser.fullName,
      email: isUser.email,
      "_id": isUser._id,
      createdOn: isUser.createdOn,
    },
    message: "User data retrieved successfully",
  });


});

// add-note api

app.post("/add-note", authenticateToken, async(req,res)=>{

  const { title, content, tags } = req.body;
  const { user } = req.user;

  if (!title) {
    return res.status(400).json({ error: true, message: "Title is required" });
  }

  if (!content) {
    return res
      .status(400)
      .json({ error: true, message: "Content is required" });
  }

  try {
  const note = new Note({
    title,
    content,
    tags: tags || [],
    userId: user._id,
  });

  await note.save();

  return res.json({
    error: false,
    note,
    message: "Note added successfully",
  });
} catch (error) {
  return res.status(500).json({
    error: true,
    message: "Internal Server Error",
  });
}


});

// update note

app.put("/edit-note/:noteId", authenticateToken, async(req,res)=>{
  const noteId = req.params.noteId;
  const {title, content, tags, isPinned} = req.body;
  const { user } = req.user;

  if(!title && !content && !tags)
  {
    return res
      .status(400)
      .json({error : true, message: "No changes provided"});
  }

  try {
    const note = await Note.findOne({_id: noteId , userId: user._id});

    if(!note){
      return res.status(404).json({error : true, message: "Note not found"});
    }

    if (title) note.title = title;
    if (content) note.content = content;
    if(tags) note.tags = tags;
    if(isPinned) note.isPinned = isPinned;

    await note.save();

    return res.json({
      error:false,
      note,
      message: "Note updated successfully",
    });
  } catch(error){
    return res.status(500).json({
      error: true,
      message:"Internal Server Error",
    });
  }
});

// Get all notes

app.get("/get-all-notes/", authenticateToken , async (req,res)=>{
  const { user } = req.user;

try {
  const notes = await Note.find({ userId: user._id }).sort({ isPinned: -1 });

  return res.json({
    error: false,
    notes,
    message: "All notes retrieved successfully",
  });
} catch (error) {
  return res.status(500).json({
    error: true,
    message: "Internal Server Error",
  });
}

})

// Delete Note

app.delete("/delete-note/:noteId", authenticateToken, async(req,res)=>{
  const noteId = req.params.noteId;
  
  const {user} = req.user;

  try {
    const note = await Note.findOne({_id : noteId, userId: user._id});


    if(!note)
    {
      return res.status(404).json({error : true, message: "Note not found"});
    }

    await Note.deleteOne({_id:noteId, userId:user._id});

    return res.json({
      error: false,
      message:"Note deleted successfully",
    });
  }
  catch(error){
    return res.status(500).json({
      error: true,
      message:"Internal Server Error",
    });
  }
});

// update isPinned

app.put("/update-note-pinned/:noteId", authenticateToken, async (req,res)=>{
  const noteId = req.params.noteId;
  const { isPinned } = req.body;
  const { user } = req.user;

  try {
    const note = await Note.findOne({ _id: noteId, userId: user._id });

    if (!note) {
      return res.status(404).json({ error: true, message: "Note not found" });
    }

    note.isPinned = isPinned;

    await note.save();

    return res.json({
      error: false,
      note,
      message: "Note updated successfully",
    });
  } catch (error) {
    return res.status(500).json({
      error: true,
      message: "Internal Server Error",
    });
  }

});

// Search Notes
  app.get("/search-notes/", authenticateToken, async (req, res) => {
    const { user } = req.user;
    const { query } = req.query;

    if (!query) {
      return res
        .status(400)
        .json({ error: true, message: "Search query is required" });
    }

    try {

      const matchingNotes = await Note.find({
      userId: user._id,
      $or: [
        { title:   { $regex: new RegExp(query, "i") } },
        { content: { $regex: new RegExp(query, "i") } },
      ],
    });

    return res.json({
      error: false,
      notes: matchingNotes,
      message: "Notes matching the search query retrieved successfully",
    });
    } catch (error) {
      return res.status(500).json({
        error: true,
        message: "Internal Server Error",
      });
    }
  });

  // Google login feature

  app.post("/auth/google", async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ error: true, message: "idToken required" });

    // Verify token against your Web Client ID
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const email = payload?.email;
    const fullName = payload?.name || "User";

    if (!email) return res.status(400).json({ error: true, message: "Email missing in Google token" });

    let user = await User.findOne({ email });

    // If local account exists, do not auto-login with Google
    if (user && user.authProvider && user.authProvider !== "google") {
      return res.status(400).json({ error: true, message: "Use email/password for this account." });
    }

    if (!user) {
      user = await User.create({
        fullName,
        email,
        password: undefined,
        authProvider: "google",
        emailVerified: true,
      });
    } else {
      user.authProvider = "google";
      user.emailVerified = true;
      await user.save();
    }

    const accessToken = jwt.sign({ user }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "36000m" });

    return res.json({
      error: false,
      accessToken,
      user: {
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        createdOn: user.createdOn,
      },
      message: "Google login successful",
    });
  } catch (err) {
    // Common issues: wrong GOOGLE_CLIENT_ID, expired token, clock skew
    return res.status(401).json({ error: true, message: "Google token invalid" });
  }
});

// Otp generation
function make6() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}


// Send OTP
app.post("/send-otp", async (req, res) => {
  try {
    const { email, purpose = "signup" } = req.body;
    if (!email) return res.status(400).json({ error: true, message: "Email required" });

    const code = make6();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await OtpToken.deleteMany({ email, purpose }); 
    await OtpToken.create({ email, code, purpose, expiresAt });

    await sendOtpMail({ to: email, code });

    return res.json({ error: false, message: "OTP sent" });
  } catch (e) {
    console.error('Send OTP error:', e); 
    return res.status(500).json({ error: true, message: "Failed to send OTP" });
  }
});

// Verify otp
app.post("/verify-otp", async (req, res) => {
  try {
    console.log('Received verify-otp:', req.body); 
    const { email, code, purpose = "signup", fullName, password } = req.body;
    if (!email || !code) return res.status(400).json({ error: true, message: "Email and code required" });

    const tokenDoc = await OtpToken.findOne({ email, code, purpose });
    if (!tokenDoc) return res.status(400).json({ error: true, message: "Invalid code" });
    if (tokenDoc.expiresAt < new Date()) return res.status(400).json({ error: true, message: "Code expired" });

    let user = await User.findOne({ email });

    if (purpose === "signup") {
      if (!user) {
        if (!fullName || !password) {
          return res.status(400).json({ error: true, message: "Name and password required for signup" });
        }
        user = await User.create({
          fullName,
          email,
          password,
          authProvider: "local",
          emailVerified: true,
        });
      } else {
        user.emailVerified = true;
        await user.save();
      }
    } else if (purpose === "login") {
      if (!user) return res.status(404).json({ error: true, message: "User not found" });
    }

    await OtpToken.deleteMany({ email, purpose }); // consume OTP

    const accessToken = jwt.sign({ user }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "36000m" });
    return res.json({
      error: false,
      accessToken,
      user: { _id: user._id, fullName: user.fullName, email: user.email },
      message: "Verification successful",
    });
  } catch (e) {
     console.error('Verify OTP error:', e);
    return res.status(500).json({ error: true, message: "Verification failed" });
  }
});



app.listen(process.env.PORT || 8080 , ()=>{
    console.log(`Server is listening on port`)
});

module.exports = app;