# scratch-client-omg

Scratch was crashing Firefox (nightly) for a while and I needed a way to view and reply to comments. This is the code I used. Also, it's all absolutely free-as-in-freedom, unlike most of the Scratch website (of which the client is now partially, but not completely, open source).

![Demo screenshot](https://u.cubeupload.com/QNgz4p.png)

### Install

```
$ git clone https://github.com/towerofnix/scratch-client-omg.git
$ cd scratch-client-omg
$ npm install
```

### Usage

```
$ node .
help

$ node . griffpatch
griffpatch  Scratcher; Joined Oct 23 2012
...

$ node . 46587498 project
Scratcharia v2.8.3
by griffpatch; id: 46587498
...
```

## Supported features

This client is definitely not a feature-complete clone of the Scratch web client, but it does support the following:

* Projects:
  * Read title, publish date, tags
  * Read instructions, notes and credits
  * Read and jump to original projects of remixes
  * View love-it and favorite counts
  * View thumbnail (directly or copy URL)
  * View project ID, which can be used alongside programs that don't use Flash, like [Scratch 3.0](https://llk.github.io/scratch-gui/) or [Phosphorus](https://phosphorus.github.io/)
  * Leave and view comments; delete any comments on your own project
* User profiles:
  * Read username, location/country, rank, join date, project count
  * Read and update "What I'm working on" and "About me"
  * View avatar (directly or copy URL)
  * View and jump to featured project (including custom label, e.g. "Work in progress")
  * List and browse projects
  * Leave and view comments; delete any comments if on your own profile
* Studios:
  * Read title, project count
  * Read description
  * View thumbnail (directly or copy URL)
  * List and browse managers, curators, and projects
  * Leave and view comments; delete your own comments if you are a manager of the studio
* Messages:
  * List recent messages
  * Jump to any page of messages (the Scratch site doesn't have a way for you to do this!)
  * Interact with messages: view favorited project, jump to page where a comment was posted, etc.
* Comments, generally:
  * Read top-level comments and browse their replies
  * Send top-level comments and reply to existing comments
  * Delete comments
