const mongoose = require("mongoose")

const domainSchema = new mongoose.Schema({
  domain: {
    type: String,
    required: true,
    unique: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  verified: {
    type: Boolean,
    default: false,
  },
  verificationCode: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
})

module.exports = mongoose.model("Domain", domainSchema)
