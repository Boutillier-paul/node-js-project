const express = require("express")
const mongoose = require("mongoose")
const jwt = require("jsonwebtoken")

// Consts
const PORT = 3000
const SECRET = "my-very-secret-key"
const CARTS = []

/**
 * App initialization
 */
const app = express()

app.use(express.json()) // Activation du raw (json)
app.use(express.urlencoded({ extended: true })) // Activation de x-wwww-form-urlencoded

// DataBase init
mongoose.connect("mongodb://localhost:27017/rocket-crous")

// Application models
const User = mongoose.model("User", {username: String, password: String})
const Dish = mongoose.model("Dish", {name: String, description: String, allergens: String, price: Number})
const Cart = mongoose.model("Cart", {user: Object, dishes: Array, price: Number, deliveryAddress: String})

/**
 * Token utilities
 */
function createToken(user) {
    // Create token
    const token = jwt.sign({
        id: user.id,
        username: user.username
    }, SECRET, { expiresIn: '3 hours' })

    return token
}

// Decode token
async function decodeToken(req, res){

    // Get token
    const token = req.headers.authorization && extractBearerToken(req.headers.authorization)
    // Decode token
    const decoded = jwt.decode(token, {complete: false})

    return decoded
}

/* Get bearer from header */
const extractBearerToken = headerValue => {
    if (typeof headerValue !== 'string') {
        return false
    }

    const matches = headerValue.match(/(bearer)\s+(\S+)/i)
    return matches && matches[2]
}

/* Check token */
const checkTokenMiddleware = (req, res, next) => {
    // Get token
    const token = req.headers.authorization && extractBearerToken(req.headers.authorization)

    // Check if exist
    if (!token) {
        return res.status(401).json({ message: 'Error. Need a token' })
    }

    // Check token validity
    jwt.verify(token, SECRET, (err, decodedToken) => {
        if (err) {
            res.status(401).json({ message: 'Error. Bad token' })
        } else {
            return next()
        }
    })
}

/**
 * Route list
 */

// Route to get info on our account (token decode)
app.get("/me", checkTokenMiddleware, async (req, res) => {

    const decoded = await decodeToken(req, res)

    return res.status(200).json({ content: decoded })
})

// Route to get all dishes
app.get("/dishes", checkTokenMiddleware, async (req, res) => {
    Dish.find()
    .then(dishes => res.status(200).json(dishes))
})

// Route to add dish to the dish list
app.post("/dishes", checkTokenMiddleware, (req, res) => {
    // If no data in request
    if (!req.body.name || !req.body.price || !req.body.description || !req.body.allergens) {
        return res.status(400).json({ message: 'Error. Please enter the correct requested data' })
    }

    const dish = new Dish(req.body)
    dish.save().then(dish => { return res.status(201).json(dish)})
})

// Route to get one dish by its id
app.get("/dishes/:id", checkTokenMiddleware, async (req, res) => {
    Dish.findById(req.params.id)
      .then((dish) => res.json(dish))
      .catch(() => res.status(404).end())
})

// Route to finalize current order with user's address
app.post("/cart/finalize", checkTokenMiddleware, async (req, res) => {

    if (!req.body.address) {
        return res.status(400).json({ message: 'Error. Please enter the correct requested data' })
    }

    const decoded = await decodeToken(req, res)
    let cart = CARTS.find(cart => cart.user === decoded.id)

    if(!cart){
        return res.status(404).json({message: "You have no active cart. Add dish to create one"})
    }
    else{
        CARTS.splice(CARTS.findIndex(c => c._id == cart._id), 1)
        cart.deliveryAddress = req.body.address
        cart.save().then(cart => { return res.status(201).json({cart: cart, message: "Your order has been sent, you'll soon be alert about delivery time"})})
    }
})

// Route to get the current cart
app.get("/cart", checkTokenMiddleware, async (req, res) => {
    const decoded = await decodeToken(req, res)
    let cart = CARTS.find(cart => cart.user === decoded.id)

    if(!cart){
        return res.status(404).json({message: "You have no active cart. Add dish to create one"})
    }
    else{
        return res.status(200).json({cart})
    }
})

// Route to add dish to user's cart by its id
app.post("/cart/:id", checkTokenMiddleware, async (req, res) => {
    const decoded = await decodeToken(req, res)
    let cart = CARTS.find(cart => cart.user === decoded.id)

    if(!cart){
        cart = new Cart({user: decoded.id, dishes: [], price: 0, deliveryAddress: ""})
        CARTS.push(cart)
    }

    Dish.findById(req.params.id)
      .then((dish) => {
          cart.dishes.push(dish)
          cart.price += dish.price
          CARTS[cart] = cart
          return res.status(200).json({message: "Add dish with name " + dish.name + " to the current cart"})
      })
      .catch((e) => { return res.status(404).json({message: "Error: dish not found " + e}) })
})

// Route to delete dish from current cart
app.put("/cart/:id", checkTokenMiddleware, async (req, res) => {
    const decoded = await decodeToken(req, res)
    let cart = CARTS.find(cart => cart.user === decoded.id)

    if(!cart){
        return res.status(404).json({message: "You have no active cart. Add dish to create one"})
    }
    else{
        Dish.findById(req.params.id)
            .then((dish) => {
                cart.dishes.splice(cart.dishes.findIndex(d => d._id == dish._id ), 1)
                cart.price -= dish.price
                CARTS[cart] = cart
                return res.status(200).json({message: "Delete dish with name " + dish.name + " from the current cart"})
      })
      .catch((e) => { return res.status(404).json({message: "Error: dish not found " + e}) })
    }
})

// Route to clear all the current cart
app.delete("/cart", checkTokenMiddleware, async (req, res) => {
    const decoded = await decodeToken(req, res)
    let cart = CARTS.find(cart => cart.user === decoded.id)

    if(!cart){
        return res.status(404).json({message: "You have no active cart. Add dish to create one"})
    }
    else{
        CARTS.splice(CARTS.findIndex(c => c._id == cart._id), 1)
        return res.status(200).json({message: "Your cart has been cleared. Add dish to create one"})
    }
})

// Login route
app.post("/login", (req, res) => {
    // If no data in request
    if (!req.body.username || !req.body.password) {
        return res.status(400).json({ message: 'Error. Please enter the correct username and password' })
    }

    // Checking and return user token
    const user = User.findOne({username: req.body.username, password: req.body.password})
                     .then(user => {return res.json({token: createToken(user)})})
                     .catch(e => {return res.status(401).json({ message: 'Bad credentials' })})

})

// Register route
app.post("/register", (req, res) => {
    // If no data in request
    if (!req.body.username || !req.body.password) {
        return res.status(400).json({ message: 'Error. Please enter the correct username and password' })
    }

    User.findOne({username: req.body.username})
        .then(user => {
            if(!user){ 
                const user = new User(req.body)
                user.save().then( user => { return res.status(201).json(user) })
            }

            else{ return res.status(403).json({ message: 'User already exists' }) }
        })
})

// If none of the above routes, return 404 not found error
app.get("*", async (req, res) => {
    return res.status(404).json({ message: 'Not Found' })
})

// Make app listen on port const
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}.`)
})
