const mongoose = require("mongoose")

const permissionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
  },
  code: {
    type: String,
    required: true,
    unique: true,
  },
  description: String,
  type: {
    type: String,
    enum: ["menu", "operation"],
    default: "operation",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
})

module.exports = mongoose.model("Permission", permissionSchema)
