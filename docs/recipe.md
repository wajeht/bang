### 🔖 How to Add Bookmarklet

To add the Command bookmarklet to your browser, follow these steps:

1. Create a new bookmark in your browser.
2. For the bookmark's name, you can use something like "Command Bookmarklet".
3. In the URL field, copy and paste the following code:
    ```javascript
    javascript: (function () {
        const link = encodeURIComponent(window.location.href).trim();
        if (!link) return;
        window.location.href = `http://command.jaw.dev/?q=!bm ${link}`;
    })();
    ```
4. Save the bookmark.

Now, whenever you want to add a bookmark using Command, simply click on this bookmarklet.

### 🔖 Browser Bookmarklet

#### 🔖 Bookmark

```javascript
javascript: (function () {
    const link = encodeURIComponent(window.location.href).trim();
    if (!link) return;
    window.location.href = `http://command.jaw.dev/?q=!bm ${link}`;
})();
```

#### ⚡️ Action

```javascript
javascript: (function () {
    const trigger = prompt('please enter a trigger').trim();
    if (!trigger) return;
    const link = encodeURIComponent(window.location.href).trim();
    if (!link) return;
    window.location.href = `http://command.jaw.dev/?q=!add !${trigger} ${link}`;
})();
```

#### 📝 Note

```javascript
javascript: (function () {
    const title = prompt('please enter a title').trim();
    if (!title) return;
    const content = prompt('please enter the content').trim();
    if (!content) return;
    window.location.href = `http://command.jaw.dev/?q=!note ${title} | ${content}`;
})();
```
