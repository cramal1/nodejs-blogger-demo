let multiparty = require('multiparty')
let then = require('express-then')
let fs = require('fs')
let DataUri = require('datauri')
let nodeify = require('bluebird-nodeify')

let Post = require('./models/post')
let User = require('./models/user')
let isLoggedIn = require('./middleware/isLoggedIn')

module.exports = (app) => {
  let passport = app.passport

  app.get('/', (req, res) => {
    res.render('index.ejs')
  })

  app.get('/login', (req, res) => {
    res.render('login.ejs', {message: req.flash('error')})
  })

  app.get('/signup', (req, res) => {
    res.render('signup.ejs', {message: req.flash('error')})
  })

  app.get('/post/:postId?', then(async (req, res) => {
      let postId = req.params.postId
      if(!postId){
        res.render('post.ejs', {
          post: {},
          verb: 'Create'
        })
        return
      }
      let post = await Post.promise.findById(postId)
      console.log(postId, post)
      if(!postId) res.send('404', 'Not Found')
      let dataUri = new DataUri
      let image = dataUri.format('.'+post.image.contentType.split('/').pop(), post.image.data)
      res.render('post.ejs', {
          post: post,
          verb: 'Edit',
          image: `data:${post.image.contentType};base64,${image.base64}`
      })
      return
    }))

  app.get('/blog/:blogId?', then(async (req, res) => {
    let blogId = req.params.blogId
    if(!blogId) res.send('404', 'Not Found')
    let posts = await Post.promise.find()
    console.log(blogId)
    // populate the user data to be populated in the profile page
    posts = await Post.promise.populate(posts, {
      path: 'creator',
      match: { _id: blogId},
    })
    let blogPost = {}
    let blogPosts = []
    for (let i = 0; i < posts.length; i++) {
      let dataUri = new DataUri
      let image = dataUri.format('.'+posts[i].image.contentType.split('/').pop(), posts[i].image.data)
      blogPost.id = posts[i].id
      blogPost.title = posts[i].title
      blogPost.content = posts[i].content
      blogPost.updated = posts[i].updated
      blogPost.image = `data:${posts[i].image.contentType};base64,${image.base64}`
      blogPosts.push(blogPost)
    }
    console.log(blogPosts)
    res.render('blog.ejs', {
        blogPosts: blogPosts,
        verb: 'View'
    })
    return
  }))

  app.post('/login', passport.authenticate('local', {
    successRedirect: '/profile',
    failureRedirect: '/login',
    failureFlash: true
  }))
  // process the signup form
  app.post('/signup', passport.authenticate('local-signup', {
    successRedirect: '/profile',
    failureRedirect: '/signup',
    failureFlash: true
  }))

  app.post('/post/:postId?', then(async (req, res) => {
      let postId = req.params.postId
      let [{title: [title], content: [content]}, {image: [file]}] = await new multiparty.Form().promise.parse(req)

      if(!postId){
        let post = new Post()
        post.userid = req.user._id.toString()
        post.creator = req.user._id
        post.title = title
        post.content = content
        post.image.data = await fs.promise.readFile(file.path)
        post.image.contentType = file.headers['content-type']
        await post.save()

        //save the user references to post
        let user = await User.promise.findById(req.user._id)
        user.posts.push(post)
        await user.save()
        res.redirect('/blog/', encodeURI(req.user.blogTitle))
        return
      }

      let post = await Post.promise.findById(postId)
      if(!post) res.send('404', 'Not Found')
      post.title = title
      post.content = content
      post.updated = Date.now()
      await post.save()
      res.redirect('/blog/', encodeURI(req.user.blogTitle))
    }))

  app.post('/delete/:postId?', then(async (req, res) => {
      let postId = req.params.postId
      console.log('Deleting post: ' + postId)
      if(!postId){
        res.redirect('/profile')
        return
      }

      let post = await Post.promise.findById(postId)
      console.log('Post to be deleted: ' + post)
      await post.remove((err) => {
        if(err) console.log('Error deleting post..' + err)
        console.log('Post deleted successfully..')
      })
      console.log('Deleted document: ' + post)
      if(!post) res.send('404', 'Not Found')
      res.redirect('/profile')
    }))

  app.get('/profile', isLoggedIn, then(async (req, res) => {

    let posts = await Post.promise.find()
    // populate the user data to be populated in the profile page
    posts = await Post.promise.populate(posts, {
      path: 'creator',
      match: { _id: req.user._id},
    })
    res.render('profile.ejs', {
      user: req.user,
      posts: posts,
      message: req.flash('error')
    })
  }))

  app.get('/logout', (req, res) => {
    req.logout()
    res.redirect('/')
  })
}
