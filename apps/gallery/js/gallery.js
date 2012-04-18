'use strict';

/*
  
This app displays photos that are stored on the phone.

Its starts with a thumbnail view in which small versions of all photos
are displayed.  Tapping on a thumbnail shows the full-size image.

When a full-size image is displayed, swiping left or right moves to
the next or previous image (this depends on the writing direction of
the locale).  The app can also perform a slideshow, transitioning
between photos automatically.



*/




//
// TODO:
//   we need a way to get photos from the camera and to store them on the device
//   the ability to download photos from the web might be nice, too.
//   we need to be able to determine the size of a photo, I think.
//   do we need to read metadata?
//   need to be able to deal with photos of different sizes and orientations
//     can't just size them to 100%,100%.
//   need to handle resize/orientationchange events because I'm guessing
//     that image sizes will have to change.
//   we should probably have a way to organize photos into albums
//   How do we localize the slideshow Play button for RTL languages?
//   Do we want users to be able to rotate photos to tell the
//     gallery app how to display them?
//   Do we want borders around the photos?
//

//
// Right now the set of photos is just hardcoded in the sample_photos directory
//
// We need to use the media storage API here or something similar.
//
const SAMPLE_PHOTOS_DIR = 'sample_photos/';
const SAMPLE_THUMBNAILS_DIR = 'sample_photos/thumbnails/';
const SAMPLE_FILENAMES = ['DSC_1677.jpg', 'DSC_1701.jpg', 'DSC_1727.jpg',
'DSC_1729.jpg', 'DSC_1759.jpg', 'DSC_4236.jpg', 'DSC_4767.jpg', 'DSC_4858.jpg',
'DSC_4861.jpg', 'DSC_4903.jpg', 'DSC_6842.jpg', 'DSC_6859.jpg', 'DSC_6883.jpg',
'DSC_7150.jpg', 'IMG_0139.jpg', 'IMG_0160.jpg', 'IMG_0211.jpg', 'IMG_0225.jpg',
'IMG_0251.jpg', 'IMG_0281.jpg', 'IMG_0476.jpg', 'IMG_0498.jpg', 'IMG_0506.jpg',
'IMG_0546.jpg', 'IMG_0554.jpg', 'IMG_0592.jpg', 'IMG_0610.jpg', 'IMG_0668.jpg',
'IMG_0676.jpg', 'IMG_1132.jpg', 'IMG_1307.jpg', 'IMG_1706.jpg', 'IMG_1974.jpg',
'IMG_7928.jpg', 'IMG_7990.jpg', 'IMG_8085.jpg', 'IMG_8164.jpg', 'IMG_8631.jpg',
'IMG_8638.jpg', 'IMG_8648.jpg', 'IMG_8652.jpg', '_MG_0053.jpg', 'P1000115.jpg',
'P1000404.jpg', 'P1000469.jpg', 'P1000486.jpg'];

const NUM_PHOTOS = SAMPLE_FILENAMES.length;

function photoURL(n) {
  if (n < 0 || n >= NUM_PHOTOS)
    return null;
  return SAMPLE_PHOTOS_DIR + SAMPLE_FILENAMES[n];
}

function thumbnailURL(n) {
  if (n < 0 || n >= NUM_PHOTOS)
    return null;
  return SAMPLE_THUMBNAILS_DIR + SAMPLE_FILENAMES[n];
}

const SLIDE_INTERVAL = 3000;   // 3 seconds on each slides
const SLIDE_TRANSITION = 500;  // 1/2 second transition between slides
const PAN_THRESHOLD = 50;      // How many pixels before one-finger pan

var currentPhotoIndex = 0;       // What photo is currently displayed
var thumbnailsDisplayed = true;  // Or is the thumbnail view showing
var slideshowTimer = null;       // Non-null if we're doing a slide show

// UI elements
var header = document.getElementById('header');
var thumbnails = document.getElementById('thumbnails');
var photos = document.getElementById('photos');
var playerControls = document.getElementById('player-controls');
var backButton = document.getElementById('back-button');
var slideshowButton = document.getElementById('play-button');

// These three divs hold the previous, current and next photos
// The divs get swapped around and reused when we pan to the
// next or previous photo: next becomes current, current becomes previous
// etc.  See nextPhoto() and previousPhoto().
var previousPhotoFrame = photos.querySelector('div.previousPhoto');
var currentPhotoFrame = photos.querySelector('div.currentPhoto');
var nextPhotoFrame = photos.querySelector('div.nextPhoto');

// The currently displayed <img> element.
// This changes as photos are panned, but showPhoto(), nextPhoto() and
// previousPhoto() keep its value current.
var currentPhoto;

// Our sample photos are all 480x800 for now, but this will change.
// These variables hold the actual pixel size of the currently displayed photo.
// FIXME: make the app work with other size photos!
var currentPhotoWidth = 480; 
var currentPhotoHeight = 800;

// This will hold a PhotoState object that encapsulates the zoom and pan
// calculations and holds the current size and position of the photo and
// also the amount of sideways swiping of the photo frames.
var photoState;

// When this variable is set to true, we ignore any user gestures
// so we don't try to pan or zoom during a photo transition.
var transitioning = false;

// This will be set to "ltr" or "rtl" when we get our localized event
var languageDirection;

//
// Create the <img> elements for the thumbnails
//
for (var i = 0; i < NUM_PHOTOS; i++) {
  var li = document.createElement('li');
  li.dataset.index = i;
  li.classList.add('thumbnailHolder');

  var img = document.createElement('img');
  img.src = thumbnailURL(i);
  img.classList.add('thumbnail');
  li.appendChild(img);

  thumbnails.appendChild(li);
}


//
// Event handlers
//

// Wait for the "localized" event before displaying the document content
window.addEventListener('localized', function showBody() {
  // Set the 'lang' and 'dir' attributes to <html> when the page is translated
  var html = document.documentElement;
  var lang = document.mozL10n.language;
  html.setAttribute('lang', lang.code);
  html.setAttribute('dir', lang.direction);
  languageDirection = lang.direction;

  // <body> children are hidden until the UI is translated
  document.body.classList.remove('hidden');
});

// Each of the photoFrame <div> elements may be subject to animated
// transitions. So give them transitionend event handlers that
// remove the -moz-transition style property when the transition ends.
// This helps prevent unexpected transitions.
function removeTransition(event) {
  event.target.style.MozTransition = '';
}
previousPhotoFrame.addEventListener('transitionend', removeTransition);
currentPhotoFrame.addEventListener('transitionend', removeTransition);
nextPhotoFrame.addEventListener('transitionend', removeTransition);

// Clicking on a thumbnail displays the photo
// FIXME: add a transition here
thumbnails.addEventListener('click', function thumbnailsClick(evt) {
  var target = evt.target;
  if (!target || !target.classList.contains('thumbnailHolder'))
    return;
  showPhoto(parseInt(target.dataset.index));
});

// Clicking on the back button goes back to the thumbnail view
backButton.addEventListener('click', function backButtonClick(evt) {
  showThumbnails();
});

// Clicking on the "play/pause" button starts or stops the slideshow
slideshowButton.addEventListener('click', function slideshowClick() {
  if (slideshowTimer)
    stopSlideshow();
  else
    startSlideshow();
});

// If a photo is displayed, then the back button goes back to
// the thumbnail view.
window.addEventListener('keyup', function keyPressHandler(evt) {
  if (!thumbnailsDisplayed && evt.keyCode == evt.DOM_VK_ESCAPE) {
    showThumbnails();
    evt.preventDefault();
  }
});

// This is the event handler for single-finger taps and swipes.
// On a tap just show or hide the back and play buttons.
// On a swipe, move to the next or previous photos.
photos.addEventListener('mousedown', function(event) {
  if (transitioning)
    return;

  var lastX = event.screenX;
  var lastY = event.screenY;
  var panning = false;

  function move(event) {
    var dx = event.screenX - lastX;
    var dy = event.screenY - lastY;

    if (!panning &&
        (Math.abs(dx) > PAN_THRESHOLD || Math.abs(dy) > PAN_THRESHOLD))
      panning = true;

    if (panning) {
      photoState.pan(dx, dy);
      photoState.setPhotoStyles(currentPhoto);
      photoState.setFrameStyles(currentPhotoFrame,
                                previousPhotoFrame,
                                nextPhotoFrame);
      lastX = event.screenX;
      lastY = event.screenY;
    }
  }

  function up(event) {
    // Remove the capturing event handlers
    document.body.removeEventListener('mousemove', move, true);
    document.body.removeEventListener('mouseup', up, true);

    if (!panning) {  // this was just a tap
      // hide or show the close and play buttons
      playerControls.classList.toggle('hidden');
      return;
    }
    else
      panning = false;

    photoState.pan(event.screenX - lastX, event.screenY - lastY);

    var direction;
    if (photoState.swipe < 0)
      direction = 1;    // next photo
    else
      direction = -1;   // previous photo

    // If we're in a right-to-left locale, reverse those directions
    if (languageDirection === 'rtl')
      direction *= -1;

    // Did we drag far enough to go on to the previous or next photo?
    // And is there a previous or next photo to display?
    if ((Math.abs(photoState.swipe) > window.innerWidth / 4) &&
        ((direction === 1 && currentPhotoIndex + 1 < NUM_PHOTOS) ||
         (direction === -1 && currentPhotoIndex > 0)))
    {
      // FIXME: Ideally, the transition time would be velocity sensitive
      if (direction === 1)
        nextPhoto(200);
      else
        previousPhoto(200);

      // If a slideshow is in progress then reset the slide timer
      // after panning to a new one.
      if (slideshowTimer)
        continueSlideshow();
    }
    else if (photoState.swipe !== 0) {
      // Otherwise, just restore the current photo by undoing
      // the translations we added during panning
      previousPhotoFrame.style.MozTransition = 'all 200ms linear';
      currentPhotoFrame.style.MozTransition = 'all 200ms linear';
      nextPhotoFrame.style.MozTransition = 'all 200ms linear';

      photoState.swipe = 0;
      photoState.setFrameStyles(currentPhotoFrame,
                                previousPhotoFrame,
                                nextPhotoFrame);

      // Ignore  pan and zoom gestures while the transition happens
      transitioning = true;
      setTimeout(function() { transitioning = false; }, 200);
    }
  }

  // Capture all subsequent mouse move and mouse up events
  document.body.addEventListener('mousemove', move, true);
  document.body.addEventListener('mouseup', up, true);
});

// Use the gestures.js library to detect 2-finger transform gestures
Gestures.detect('transform', photos);

// For now, we only respond to scale gestures to allow the user to
// zoom in on the photo.  
photos.addEventListener('transformgesture', function(e) {
  if (transitioning)
    return;
  photoState.zoom(e.detail.relative.scale, e.detail.clientX, e.detail.clientY);
  photoState.setPhotoStyles(currentPhoto);
  photoState.setFrameStyles(currentPhotoFrame,
                            previousPhotoFrame,
                            nextPhotoFrame);
});

// Switch from single-picture view to thumbnail view
function showThumbnails() {
  stopSlideshow();

  thumbnails.classList.remove('hidden');
  header.classList.remove('hidden');
  photos.classList.add('hidden');
  playerControls.classList.add('hidden');
  thumbnailsDisplayed = true;
}

// A utility function to insert an <img src="url"> tag into an element
// URL should be the image to display. Frame should be previousPhotoFrame,
// currentPhotoFrame or nextPhotoFrame.  Used in showPhoto(), nextPhoto()
// and previousPhoto()
function displayImageInFrame(url, frame) {
  frame.innerHTML = url ? '<img src="' + url + '"/>' : '';
}

// Switch from thumbnail list view to single-picture view
// and display the specified photo.
function showPhoto(n) {
  if (thumbnailsDisplayed) {
    thumbnails.classList.add('hidden');
    header.classList.add('hidden');
    photos.classList.remove('hidden');
    playerControls.classList.remove('hidden');
    thumbnailsDisplayed = false;
  }

  displayImageInFrame(photoURL(n - 1), previousPhotoFrame);
  displayImageInFrame(photoURL(n), currentPhotoFrame);
  displayImageInFrame(photoURL(n + 1), nextPhotoFrame);
  currentPhotoIndex = n;
  currentPhoto = currentPhotoFrame.firstElementChild;

  // Create the PhotoState object that stores the photo pan/zoom state
  // And use it to apply CSS styles to the photo and photo frames.
  // FIXME: these sizes are hardcoded right now.
  photoState = new PhotoState(currentPhotoWidth, currentPhotoHeight);
  photoState.setPhotoStyles(currentPhoto);
  photoState.setFrameStyles(currentPhotoFrame,
                            previousPhotoFrame,
                            nextPhotoFrame);
}

// Transition to the next photo, animating it over the specified time (ms).
// This is used when the user pans and also for the slideshow.
function nextPhoto(time) {
  // If already displaying the last one, do nothing.
  if (currentPhotoIndex === NUM_PHOTOS - 1)
    return;

  // Set a flag to ignore pan and zoom gestures during the transition.
  transitioning = true;
  setTimeout(function() { transitioning = false; }, time);

  // Set transitions for the visible photos
  previousPhotoFrame.style.MozTransition = '';  // Not visible
  currentPhotoFrame.style.MozTransition = 'all ' + time + 'ms linear';
  nextPhotoFrame.style.MozTransition = 'all ' + time + 'ms linear';

  // Remove the classes
  previousPhotoFrame.classList.remove('previousPhoto');
  currentPhotoFrame.classList.remove('currentPhoto');
  nextPhotoFrame.classList.remove('nextPhoto');

  // Cycle the three frames so next becomes current,
  // current becomes previous, and previous becomes next.
  var tmp = previousPhotoFrame;
  previousPhotoFrame = currentPhotoFrame;
  currentPhotoFrame = nextPhotoFrame;
  nextPhotoFrame = tmp;
  currentPhotoIndex++;

  // Update the image for the new next photo
  displayImageInFrame(photoURL(currentPhotoIndex + 1), nextPhotoFrame);

  // And add appropriate classes to the newly cycled frames
  previousPhotoFrame.classList.add('previousPhoto');
  currentPhotoFrame.classList.add('currentPhoto');
  nextPhotoFrame.classList.add('nextPhoto');

  // Remember the new current <img> element.
  currentPhoto = currentPhotoFrame.firstElementChild;

  // Remember the old photoState object
  var previousPhotoState = photoState;

  // Start with default pan and zoom state for the new photo 
  // And also reset the translation caused by swiping the photos
  // FIXME: use the real size of the photo
  photoState = new PhotoState(currentPhotoWidth, currentPhotoHeight);
  photoState.setPhotoStyles(currentPhoto);
  photoState.setFrameStyles(currentPhotoFrame,
                            previousPhotoFrame,
                            nextPhotoFrame);

  // When the transition is done, restore the previous photo state
  previousPhotoFrame.addEventListener('transitionend', function done(e) {
    // Recompute and reposition the photo that just transitioned off the screen
    previousPhotoState.reset();
    previousPhotoState.setPhotoStyles(previousPhotoFrame.firstElementChild);

    // FIXME: I want a jquery-style once() utility for auto removal
    previousPhotoFrame.removeEventListener('transitionend', done);
  });
}

// Just like nextPhoto() but in the other direction
function previousPhoto(time) {
  // If already displaying the first one, do nothing.
  if (currentPhotoIndex === 0)
    return;

  // Set a flag to ignore pan and zoom gestures during the transition.
  transitioning = true;
  setTimeout(function() { transitioning = false; }, time);

  // Transition the two visible photos
  previousPhotoFrame.style.MozTransition = 'all ' + time + 'ms linear';
  currentPhotoFrame.style.MozTransition = 'all ' + time + 'ms linear';
  nextPhotoFrame.style.MozTransition = ''; // Not visible

  // Remove the frame classes since we're about to cycle the frames
  previousPhotoFrame.classList.remove('previousPhoto');
  currentPhotoFrame.classList.remove('currentPhoto');
  nextPhotoFrame.classList.remove('nextPhoto');

  // Transition to the previous photo: previous becomes current, current
  // becomes next, etc.
  var tmp = nextPhotoFrame;
  nextPhotoFrame = currentPhotoFrame;
  currentPhotoFrame = previousPhotoFrame;
  previousPhotoFrame = tmp;
  currentPhotoIndex--;

  // Preload the new previous photo
  displayImageInFrame(photoURL(currentPhotoIndex - 1), previousPhotoFrame);

  // And add the frame classes to the newly cycled frame divs.
  previousPhotoFrame.classList.add('previousPhoto');
  currentPhotoFrame.classList.add('currentPhoto');
  nextPhotoFrame.classList.add('nextPhoto');
 
  // Get the new current photo
  currentPhoto = currentPhotoFrame.firstElementChild;
  
  // Remember the old PhotoState object
  var nextPhotoState = photoState;
  
  // Create a new photo state
  photoState = new PhotoState(currentPhotoWidth, currentPhotoHeight);
  photoState.setPhotoStyles(currentPhoto);
  photoState.setFrameStyles(currentPhotoFrame,
                            previousPhotoFrame,
                            nextPhotoFrame);

  // When the transition is done, restore the previous photo state
  nextPhotoFrame.addEventListener('transitionend', function done(e) {
    // Recompute and reposition the photo that just transitioned off the screen
    nextPhotoState.reset();
    nextPhotoState.setPhotoStyles(nextPhotoFrame.firstElementChild);

    // FIXME: I want a jquery-style once() utility for auto removal
    nextPhotoFrame.removeEventListener('transitionend', done);
  });
}

function startSlideshow() {
  // If we're already displaying the last slide, then move to the first
  if (currentPhotoIndex === NUM_PHOTOS - 1)
    showPhoto(0);

  // Now schedule the next slide
  slideshowTimer = setTimeout(nextSlide, SLIDE_INTERVAL);
  slideshowButton.classList.add('playing');
}

function stopSlideshow() {
  if (slideshowTimer) {
    clearTimeout(slideshowTimer);
    slideshowTimer = null;
  }
  slideshowButton.classList.remove('playing');
}

// Transition to the next photo as part of a slideshow.
// Note that this is different than nextPhoto().
function nextSlide() {
  // Move to the next slide if we're not already on the last one
  if (currentPhotoIndex + 1 < NUM_PHOTOS) {
    nextPhoto(SLIDE_TRANSITION);
  }

  // And schedule the next slide transition
  slideshowTimer = null;
  continueSlideshow();
}

// Clear any existing slideshow timer, and if there are more slides to
// show, start a new timer to show the next one. We use this after each
// slide is shown, and also in the panning code so that if you manually pan
// during a slide show, the timer resets and you get the full time to
// view each slide.
function continueSlideshow() {
  if (slideshowTimer)
    clearInterval(slideshowTimer);

  // If we're still not on the last one, then schedule another slide.
  if (currentPhotoIndex + 1 < NUM_PHOTOS) {
    slideshowTimer = setTimeout(nextSlide, SLIDE_INTERVAL);
  }
  // Otherwise, stop the slideshow
  else {
    slideshowTimer = null;
    stopSlideshow();
  }
}

/**
 * This class encapsulates the zooming and panning functionality for
 * the gallery app and maintains the current size and position of the 
 * currently displayed photo as well as the transition state (if any)
 * between photos.
 */
function PhotoState(width,height) {
  // Remember the actual size of the photograph
  this.photoWidth = width;
  this.photoHeight = height;

  // Do all the calculations
  this.reset();
}

// Compute the default size and position of the photo
PhotoState.prototype.reset = function() {
  // And the actual size of the window 
  // Create a new Tranform when we get a resize or orientationchange event
  this.screenWidth = window.innerWidth;
  this.screenHeight = window.innerHeight;

  // Figure out the scale to make the photo fit in the window
  var scalex = this.screenWidth / this.photoWidth;
  var scaley = this.screenHeight / this.photoHeight;
  this.baseScale = Math.min(Math.min(scalex, scaley), 1);
  this.scale = 1;

  // Compute photo size and position at that scale
  this.width = Math.floor(this.photoWidth * this.baseScale);
  this.height = Math.floor(this.photoHeight * this.baseScale);
  this.left = (this.screenWidth - this.width)/2;
  this.top = (this.screenHeight - this.height)/2;

  // We start off with no swipe from left to right
  this.swipe = 0;
}

// Zoom in by the specified factor, adjusting the pan amount so that
// the point (x,y) stays at the same spot on the screen. Assume that zoom
// gestures can't be done in the middle of swipes, so if we're calling 
// zoom, then the swipe property will be 0.
PhotoState.prototype.zoom = function(scale, x, y) {
  this.scale *= scale;

  // Never zoom in farther than 2x the native resolution of the image
  if (this.baseScale * this.scale > 2) {
    this.scale = 2/this.baseScale;
  }
  // And never zoom out to make the image smaller than it would normally be
  else if (this.scale < 1) {
    this.scale = 1;
  }

  this.width = Math.floor(this.photoWidth * this.baseScale * this.scale);
  this.height = Math.floor(this.photoHeight * this.baseScale * this.scale);

  // Adjust with a pan. This is to keep the midpoint of the gesture in place.
  // XXX: I'm not sure my math is right here.
  this.pan(Math.floor((1-scale) * (x - this.left)),
           Math.floor((1-scale) * (y - this.top)));

  // And if the pan caused a sideways swipe, remove that
  this.swipe = 0;

  // XXX: When zooming out, we can end up with blank space on the
  // screen and big parts of the image off the screen, so we've got
  // to adjust to make sure we don't have blank areas.


};

PhotoState.prototype.pan = function(dx, dy) {
  // Handle panning in the y direction first, since it is easier.
  // Don't pan in the y direction if we already fit on the screen
  if (this.height > this.screenHeight) {
    this.top += dy;

    // Don't let the top of the photo be below the top of the screen
    if (this.top > 0)
      this.top = 0;

    // bottom of photo shouldn't be above the bottom of screen
    if (this.top + this.height < this.screenHeight) 
      this.top = this.screenHeight - this.height;
  }

  // Now handle the X dimension. In this case, we have to handle panning within
  // a zoomed image, and swiping to transition from one photo to the next
  // or previous.
  if (this.width <= this.screenWidth) {
    // In this case, the photo isn't zoomed in, so we're just doing swiping
    this.swipe += dx;
  }
  else {
    if (this.swipe === 0) {
      this.left += dx;
      
      // If this would take the left edge of the photo past the 
      // left edge of the screen, then we've got to do a swipe
      if (this.left > 0) {
        this.swipe += this.left;
        this.left = 0;
      }
      
      // Or, if this would take the right edge of the photo past the
      // right edge of the screen, then we've got to swipe the other way
      if (this.left + this.width < this.screenWidth) {
        this.swipe += this.left + this.width - this.screenWidth;
        this.left = this.screenWidth - this.width;
      }
    }
    else if (this.swipe > 0) {
      this.swipe += dx;
      if (this.swipe < 0) {
        this.left += this.swipe;
        this.swipe = 0;
      }
    }
    else if (this.swipe < 0) {
      this.swipe += dx;
      if (this.swipe > 0) {
        this.left += this.swipe;
        this.swipe = 0;
      }
    }
  }
};

PhotoState.prototype.setPhotoStyles = function(img) {
  img.style.width = this.width + "px";
  img.style.height = this.height + "px";
  img.style.top = this.top + "px";
  img.style.left = this.left + "px";
};

PhotoState.prototype.setFrameStyles = function(/*frames...*/) {
  var translate = 'translate(' + this.swipe + 'px)';
  for(var i = 0; i < arguments.length; i++) 
    arguments[i].style.MozTransform = translate;
}
