## 核心原理

两个入口文件，分别打包出两个 js 包，一个在客户端调用，一个在服务端调用。

- entry-server.js：框架允许你将组件渲染成静态标记。如 ReactDOMServer.renderToString()。并在服务端调用，写到 index.html 里，访问 url 时返回(下面的`<!--app-html-->`被替换成 renderToString 返回的静态字符串)
- entry-client.js：index.23b4f503.js 为打包出来文件，会在客户端执行执行，绑定事件

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite App</title>
    <script type="module" crossorigin src="/assets/index.23b4f503.js"></script>
    <link rel="modulepreload" href="/assets/vendor.af24b7fa.js" />
  </head>
  <body>
    <div id="app"><!--app-html--></div>
  </body>
</html>
```

## 路由同构

简单理解为服务端也要把一个路径渲染为对应的路由页面,可以是用 location 来实现

```js
import ReactDOMServer from "react-dom/server";
import { StaticRouter } from "react-router-dom";
import { App } from "./App";

export function render(url, context) {
  return ReactDOMServer.renderToString(
    <StaticRouter location={url} context={context}>
      <App />
    </StaticRouter>
  );
}
```

## 事件同构 - hydrate

> 与 render() 相同，但它用于在 ReactDOMServer 渲染的容器中对 HTML 的内容进行 hydrate 操作。React 会尝试在已有标记上绑定事件监听器

服务端没有 dom，渲染出来的 html 字符串, 也就没有了元素事件监听。
所以客服端需要重新再渲染一次，把事件绑定上，ReactDOM.hydrate 匹配 server 端创建的节点信息，并绑上事件

```js
import ReactDOM from "react-dom";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";

ReactDOM.hydrate(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
  document.getElementById("app")
);
```

## 数据注水

context 就是需要注入的数据,可以把取数据方法写到 page 里，这里拿到 page 去调用

```js
const url = req.originalUrl;

let template, render;
if (!isProd) {
  // always read fresh template in dev
  template = fs.readFileSync(resolve("index.html"), "utf-8");
  template = await vite.transformIndexHtml(url, template);
  render = (await vite.ssrLoadModule("/src/entry-server.jsx")).render;
} else {
  template = indexProd;
  render = require("./dist/server/entry-server.js").render;
}

const context = {};
const appHtml = render(url, context);

if (context.url) {
  // Somewhere a `<Redirect>` was rendered
  return res.redirect(301, context.url);
}

const html = template.replace(`<!--app-html-->`, appHtml);

res.status(200).set({ "Content-Type": "text/html" }).end(html);
```

render 就是 ReactDOMServer.renderToString

```js
export function render(url, context) {
  return ReactDOMServer.renderToString(
    <StaticRouter location={url} context={context}>
      <App />
    </StaticRouter>
  );
}
```

如何实现组件维度数据预取

```js
//组件
class Index extends React.Component {
  constructor(props) {
    super(props);
  }

  //数据预取方法  静态 异步 方法
  static async getInitialProps(opt) {
    const fetch1 = await fetch("/xxx.com/a");
    const fetch2 = await fetch("/xxx.com/b");

    return {
      res: [fetch1, fetch2],
    };
  }

  render() {
    return <h1>{this.props.data.title}</h1>;
  }
}

//node server
http
  .createServer((req, res) => {
    const url = req.url;
    if (url.indexOf(".") > -1) {
      res.end("");
      return false;
    }

    res.writeHead(200, {
      "Content-Type": "text/html",
    });

    //组件查找
    const branch = matchRoutes(routes, url);

    //得到组件
    const Component = branch[0].route.component;

    //数据预取
    const data = Component.getInitialProps(branch[0].match.params);

    //传入数据，渲染组件为 html 字符串
    const html = renderToString(<Component data={data} />);

    res.end(html);
  })
  .listen(8080);
```

如何直接把数据注入到前端：window.**INITIAL_DATA** = ${JSON.stringify(data)}

```js
//...
const fetch = require("isomorphic-fetch");

router.get("*", async (ctx) => {
  //fetch branch info from github
  const api = "https://api.github.com/repos/jasonboy/wechat-jssdk/branches";
  const data = await fetch(api).then((res) => res.json());

  //传入初始化数据
  const rendered = s.render(ctx.url, data);

  const html = `
    <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
      </head>
      <body>
        <div id="app">${rendered.html}</div>
        
        <script type="text/javascript">window.__INITIAL_DATA__ = ${JSON.stringify(
          data
        )}</script>
        
        <script type="text/javascript" src="/runtime.js"></script>
        ${rendered.scripts.join()}
        <script type="text/javascript" src="/app.js"></script>
      </body>
    </html>
  `;
  ctx.body = html;
});
```

## 异构处理

通过 webpack global 注入环境变量 或 vite 的 import.meta.env 来区分 SSR

```js
// 如果不是 ssr 执行部分特殊逻辑
if (import.meta.env !== "ssr") {
  document.addEventListener();
}
```

## 降级处理

- Node 中间件降级:结合 CPU 利用率及内存指标，根据实际情况设定阈值，超过阈值将 SSR 降级为 CSR。(直接重定向到前端静态资源)
- Nginx 配置降级
  - 在 nginx 配置中，将 ssr 请求转发至 Node 渲染服务器，并开启响应状态码拦截；
  - 若响应异常，将异常状态转为 200 响应，并指向新的重定向规则；
  - 重定向规则去掉 ssr 目录后重定向地址，将请求转发至静态 HTML 文件服务器。


## SSR 优化 1 自动生成预加载指令

### 生成 ssr-manifest.json：

- vite build 支持使用 --ssrManifest 标志，这将会在构建输出目录中生成一份 ssr-manifest.json
- 该 SSR 清单是从客户端构建生成而来，因为我们想要将模块 ID 映射到客户端文件上，清单包含模块 ID 到它们关联的 chunk 和资源文件的映射。

```json
{
  "src/pages/Store.vue?vue&type=style&index=0&scoped=true&lang.css": [
    "/assets/Store.dbc138ae.js",
    "/assets/Store.424e932e.css"
  ],
  "src/pages/Store.vue": [
    "/assets/Store.dbc138ae.js",
    "/assets/Store.424e932e.css"
  ],
  "src/components/ImportType.vue": ["/assets/ImportType.2fffc92d.js"],
  "src/components/foo.css": [
    "/assets/Foo.70a22828.js",
    "/assets/Foo.a8752494.css"
  ],
  "src/components/Foo.jsx": [
    "/assets/Foo.70a22828.js",
    "/assets/Foo.a8752494.css"
  ]
}
```

### 收集组件模块 ID

为了利用该清单，框架需要提供一种方法来收集在服务器渲染调用期间使用到的组件模块 ID。

@vitejs/plugin-vue 支持该功能，开箱即用，并会自动注册使用的组件模块 ID 到相关的 Vue SSR 上下文(猜测是用了这个插件会在 vueServerRenderer 里 add 一些收集组件 uri 的中间件。写到 ctx 上)

```js
// src/entry-server.js
const ctx = {};
const html = await vueServerRenderer.renderToString(app, ctx);
// ctx.modules 现在是一个渲染期间使用的模块 ID 的 Set ['src/components/Foo.jsx'， 'src/pages/Store.vue'....]
```

### 写入预加载指令到html

结合ssr-manifest.json 和 收集到的组件ID（ctx.modules），拿到需要预加载的资源路径和名称。

从而可以让 renderer 自动推导需要在 HTML 模板中注入的内容，从而实现最佳的预加载(preload)和预取(prefetch)资源.

```js
import { createApp } from './main'
import { renderToString } from 'vue/server-renderer'
import path, { basename } from 'path'

export async function render(url, manifest) {
  const { app, router } = createApp()

  // set the router to the desired URL before rendering
  router.push(url)
  await router.isReady()

  // passing SSR context object which will be available via useSSRContext()
  // @vitejs/plugin-vue injects code into a component's setup() that registers
  // itself on ctx.modules. After the render, ctx.modules would contain all the
  // components that have been instantiated during this render call.
  const ctx = {}
  const html = await renderToString(app, ctx)

  // the SSR manifest generated by Vite contains module -> chunk/asset mapping
  // which we can then use to determine what files need to be preloaded for this
  // request.
  const preloadLinks = renderPreloadLinks(ctx.modules, manifest)
  return [html, preloadLinks]
}

function renderPreloadLinks(modules, manifest) {
  let links = ''
  const seen = new Set()
  modules.forEach((id) => {
    const files = manifest[id]
    if (files) {
      files.forEach((file) => {
        if (!seen.has(file)) {
          seen.add(file)
          const filename = basename(file)
          if (manifest[filename]) {
            for (const depFile of manifest[filename]) {
              links += renderPreloadLink(depFile)
              seen.add(depFile)
            }
          }
          links += renderPreloadLink(file)
        }
      })
    }
  })
  return links
}

function renderPreloadLink(file) {
  if (file.endsWith('.js')) {
    return `<link rel="modulepreload" crossorigin href="${file}">`
  } else if (file.endsWith('.css')) {
    return `<link rel="stylesheet" href="${file}">`
  } else if (file.endsWith('.woff')) {
    return ` <link rel="preload" href="${file}" as="font" type="font/woff" crossorigin>`
  } else if (file.endsWith('.woff2')) {
    return ` <link rel="preload" href="${file}" as="font" type="font/woff2" crossorigin>`
  } else if (file.endsWith('.gif')) {
    return ` <link rel="preload" href="${file}" as="image" type="image/gif">`
  } else if (file.endsWith('.jpg') || file.endsWith('.jpeg')) {
    return ` <link rel="preload" href="${file}" as="image" type="image/jpeg">`
  } else if (file.endsWith('.png')) {
    return ` <link rel="preload" href="${file}" as="image" type="image/png">`
  } else {
    // TODO
    return ''
  }
}

```