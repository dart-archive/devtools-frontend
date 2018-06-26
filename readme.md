# Dart DevTools

This is a fork of the client-side of the Chrome DevTools, including all JS & CSS to run the DevTools webapp. The original sources are at https://github.com/ChromeDevTools

### Getting Started

1. Clone the repo
2. Go to repo root and run:  `./ddt <url>`
    - This launches a separate instance of Chrome in a new user profile with the debugging port open and also starts the devtools server
    - It should automatically open three pages, a reference page, the web app at <url> and a Dart DevTools instance on that page.

> **Power user tips:**
>
> You can run chrome and the server directly by running `npm start`. This
> enables customizing the options. For example, you can customize the port for
> the dev server: e.g. `PORT=8888 npm start`.
>
> You can also launch chrome and start the server separately:
> - `npm run chrome`
> - `npm run server`
>
> When you start Chrome separately, you can pass extra args to Chrome:
> ```
> npm run chrome -- https://news.ycombinator.com
> ```
> (e.g. this launches Hacker News on startup)
>
> If you want to reset your development profile for Chrome, pass in "--reset-profile":
> ```
> npm start -- --reset-profile
> ```
> *OR*
> ```
> npm run chrome -- --reset-profile
> ```

### Changes from Regular Devtools

  - Custom formatters are on by default
  - Black boxing the SDK is on by default
  - A minimal set of Dart expressions work in the console and watch. Only
    expression of the form "object.thing.otherThing" work so far, and some
    object references won't work (e.g. library variables).
  - A fix for one of the breakpoint location problems

### Bugs

  - File issues against this repo, `https://github.com/dart-lang/devtools-frontend/issues` , unless they contain confidential information, in which case they can be filed against the "Dev Compiler (DDC)" component.
