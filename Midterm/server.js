// LIVE CODING DEMO: Building a Blog API with MongoDB

// ============================================
// STEP 1: Initial Setup 

const express = require('express');
const mongoose = require('mongoose');
const app = express();

app.use(express.json());

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/blog_demo', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

// ============================================
// STEP 2: Define the Blog Post Schema and Model

const postSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100
    },
    content: {
        type: String,
        required: true
    },
    author: {
        type: String,
        required: true
    },
    tags: [String],
    likes: {
        type: Number,
        default : 0
    },
    comments: [{
        text: String,
        user: String,
        date: {
            type: Date,
            default: Date.now
        }
    }],
    published: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Add a custom method
postSchema.methods.publish = function() {
    this.published = true;
    return this.save();
};

const Post = mongoose.model('Post', postSchema);

// ============================================
// STEP 3: Define API Endpoints

// Create a new blog post
app.post('/api/posts', async (req, res) => {
    try {
        const post = new Post(req.body);
        await post.save();

        res.status(201).json({
            success: true,
            data: post,
            message: 'Post created successfully'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// Read - get all posts with filtering
app.get('/api/posts', async (req, res) => {
    try {
        const { tag, published, limit = 10 } = req.query;

        // Build dynamic query
        let query = {};
        if (tag) query.tags = tag;
        if (published !== undefined) query.published = published === 'true';

        const posts = await Post.find(query).limit(parseInt(limit)).sort({ createdAt: -1 }); // Newest first

        res.json({
            success: true,
            count: posts.length,
            data: posts
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        })
    }
});

// Update - Like a post demonstrating atmoic operations
app.patch('/api/posts/:id/like', async (req, res) => {
    try {
        // Atomic increment, prevent race conditions
        const post = await Post.findByIdAndUpdate(
            req.params.id,
            { $inc: { likes: 1 } },
            { new: true }
        );

        if (!post) {
            return res.status(404).json({
                success: false,
                message: 'Post not found'
            });
        }

        res.json({
            success: true,
            data: { likes: post.likes}
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }

});

// Add comment to a post - demonstrate subdocument operations
app.post('/api/posts/:id/comments', async (req, res) => {
    try {
        const { text, user } = req.body;  // FIX APPLIED HERE
        
        const post = await Post.findByIdAndUpdate(
            req.params.id,
            {
                $push: {
                    comments: { text, user }
                }
            },
            { new: true }
        );

        res.json({
            success: true,
            data: post.comments[post.comments.length - 1]
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Step 4: Advanved Query - Adding a powerful search feature
app.get('/api/posts/search', async (req, res) => {
    try {
        const { q } = req.query;

        const results = await Post.aggregate([
            // Match posts containing search items
            {
                $match: {
                    $or: [
                        { title: { $regex: q, $options: 'i' } },
                        { content: { $regex: q, $options: 'i' } }
                    ]
                }
            },
            // Add computed field
            {
                $addFields: {
                    engagement:{
                        $add: [ "$likes", { $size: "$comments" } ]
                    }
                }
            },
            // Sort by engagement
            {
                $sort: { engagement: -1 }
            },
            // Limit results
            {
                $limit: 5
            }
            
        ]);
        res.json({
            success: true,
            query: q,
            count: results.length,
            data: results
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Real time stats / analytics

app.get('/api/posts/stats', async (req, res) => {
    try {
        const stats = await Post.aggregate([
            {
                $group: {
                    _id: null,
                    totalPosts: { $sum: 1 },
                    totalLikes: { $sum: "$likes" },
                    avgLikes: { $avg: "$likes" },
                    publishedCount: { $sum: { $cond: [ "$published", 1, 0 ] } }
                }
            }
        ]);
        
        res.json({
            success: true,
            data: stats[0] || {}
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});