## 核心原理
两个入口文件，分别打包出两个js包，一个在客户端调用，一个在服务端调用。
- entry-server.js：框架允许你将组件渲染成静态标记。如ReactDOMServer.renderToString()。并在服务端调用，写到index.html里，访问url时返回(下面的`<!--app-html-->`被替换成renderToString返回的静态字符串)
- entry-client.js：index.23b4f503.js为打包出来文件，会在客户端执行执行，绑定事件
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite App</title>
    <script type="module" crossorigin src="/assets/index.23b4f503.js"></script>
    <link rel="modulepreload" href="/assets/vendor.af24b7fa.js">
  </head>
  <body>
    <div id="app"><!--app-html--></div>
    
  </body>
</html>
```

## 路由同构

简单理解为服务端也要把一个路径渲染为对应的路由页面,可以是用location来实现
```js
import ReactDOMServer from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { App } from './App'

export function render(url, context) {
  return ReactDOMServer.renderToString(
    <StaticRouter location={url} context={context}>
      <App />
    </StaticRouter>
  )
}
```

## 事件同构 - hydrate
> 与 render() 相同，但它用于在 ReactDOMServer 渲染的容器中对 HTML 的内容进行 hydrate 操作。React 会尝试在已有标记上绑定事件监听器


服务端没有dom，渲染出来的html字符串, 也就没有了元素事件监听。
所以客服端需要重新再渲染一次，把事件绑定上，ReactDOM.hydrate 匹配server端创建的节点信息，并绑上事件

```js
import ReactDOM from 'react-dom'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'

ReactDOM.hydrate(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
  document.getElementById('app')
)
```

## 数据注水

context 就是需要注入的数据,可以把取数据方法写到page里，这里拿到page去调用

```js
      const url = req.originalUrl

      let template, render
      if (!isProd) {
        // always read fresh template in dev
        template = fs.readFileSync(resolve('index.html'), 'utf-8')
        template = await vite.transformIndexHtml(url, template)
        render = (await vite.ssrLoadModule('/src/entry-server.jsx')).render
      } else {
        template = indexProd
        render = require('./dist/server/entry-server.js').render
      }

      const context = {}
      const appHtml = render(url, context)

      if (context.url) {
        // Somewhere a `<Redirect>` was rendered
        return res.redirect(301, context.url)
      }

      const html = template.replace(`<!--app-html-->`, appHtml)

      res.status(200).set({ 'Content-Type': 'text/html' }).end(html)
```

render 就是 ReactDOMServer.renderToString

```js
export function render(url, context) {
  return ReactDOMServer.renderToString(
    <StaticRouter location={url} context={context}>
      <App />
    </StaticRouter>
  )
}
```
如何实现组件维度数据预取
```js
//组件
class Index extends React.Component{
    constructor(props){
        super(props);
    }

    //数据预取方法  静态 异步 方法
    static async  getInitialProps(opt) {
        const fetch1 =await fetch('/xxx.com/a');
        const fetch2 = await fetch('/xxx.com/b');

        return {
            res:[fetch1,fetch2]
        }
    }

    render(){
        return <h1>{this.props.data.title}</h1>
    }
}

//node server 
http.createServer((req, res) => {
    
        const url = req.url;
        if(url.indexOf('.')>-1) { res.end(''); return false;}

        res.writeHead(200, {
            'Content-Type': 'text/html'
        });
        
        //组件查找
        const branch =  matchRoutes(routes,url);
        
        //得到组件
        const Component = branch[0].route.component;
    
        //数据预取
        const data = Component.getInitialProps(branch[0].match.params);
      
        //传入数据，渲染组件为 html 字符串
        const html = renderToString(<Component data={data}/>);

        res.end(html);

 }).listen(8080);
```

如何直接把数据注入到前端：window.__INITIAL_DATA__ = ${JSON.stringify(data)}

```js
//...
const fetch = require('isomorphic-fetch');

router.get('*', async (ctx) => {
  //fetch branch info from github
  const api = 'https://api.github.com/repos/jasonboy/wechat-jssdk/branches';
  const data = await fetch(api).then(res => res.json());
  
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
        
        <script type="text/javascript">window.__INITIAL_DATA__ = ${JSON.stringify(data)}</script>
        
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

通过 webpack global 注入环境变量 或 vite 的 import.meta.env 来区分SSR

```js
// 如果不是 ssr 执行部分特殊逻辑
if (import.meta.env !== 'ssr') {
  document.addEventListener()
}
```

## 降级处理

- Node 中间件降级:结合CPU利用率及内存指标，根据实际情况设定阈值，超过阈值将SSR降级为CSR。(直接重定向到前端静态资源)
- Nginx配置降级
  - 在nginx配置中，将ssr请求转发至Node渲染服务器，并开启响应状态码拦截；
  - 若响应异常，将异常状态转为200响应，并指向新的重定向规则；
  - 重定向规则去掉ssr目录后重定向地址，将请求转发至静态HTML文件服务器。

##  todo ： vue-ssr-server-bundle.json