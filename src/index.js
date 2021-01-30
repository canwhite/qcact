function createElement(type, props, ...children) {
    return {
      type,
      props: {
        ...props,
        children: children.map(child =>
          typeof child === "object" ? child : createTextElement(child)
        )
      }
    };
  }
  
  function createTextElement(text) {
    return {
      type: "TEXT_ELEMENT",
      props: {
        nodeValue: text,
        children: []
      }
    };
  }
  
  /*
  function createDom(fiber){
    const dom =
    fiber.type === "TEXT_ELEMENT"
      ? document.createTextNode("")
      : document.createElement(fiber.type);
    const isProperty = key => key !== "children";
    Object.keys(fiber.props)
      .filter(isProperty)
      .forEach(name => {
        dom[name] = fiber.props[name];
      });

    return dom;
  }
  */

  function createDom(fiber) {
    const dom =
      fiber.type === "TEXT_ELEMENT"
        ? document.createTextNode("")
        : document.createElement(fiber.type)
  
    updateDom(dom, {}, fiber.props)
  
    return dom
  }

  const isEvent = key => key.startsWith("on")
  const isProperty = key =>
    key !== "children" && !isEvent(key)
  const isNew = (prev, next) => key =>
    prev[key] !== next[key]
  const isGone = (prev, next) => key => !(key in next)
  function updateDom(dom, prevProps, nextProps) {
    //Remove old or changed event listeners
    Object.keys(prevProps)
      .filter(isEvent)
      .filter(
        key =>
          !(key in nextProps) ||
          isNew(prevProps, nextProps)(key)//柯里化应用
      )
      .forEach(name => {
        const eventType = name
          .toLowerCase()
          .substring(2)
        dom.removeEventListener(
          eventType, //去掉on的键值
          prevProps[name] //对应的逻辑块
        )
      })
  
    // Remove old properties
    Object.keys(prevProps)
      .filter(isProperty)
      .filter(isGone(prevProps, nextProps))
      .forEach(name => {
        dom[name] = ""
      })
  
    // Set new or changed properties
    Object.keys(nextProps)
      .filter(isProperty)
      .filter(isNew(prevProps, nextProps))
      .forEach(name => {
        dom[name] = nextProps[name]
      })
  
    // Add event listeners
    Object.keys(nextProps)
      .filter(isEvent)
      .filter(isNew(prevProps, nextProps))
      .forEach(name => {
        const eventType = name
          .toLowerCase()
          .substring(2)
        dom.addEventListener(
          eventType,
          nextProps[name]
        )
      })
  }
  
  //我们在这里将所有的节点递归追加到dom上
  function commitRoot(){
    //todo add nodes to dom
    //处理需要删除的node
    deletions.forEach(commitWork);

    //渲染的时候是从顶层开始渲染的
    commitWork(wipRoot.child);
    //每次渲染完之后会留下一个currentRoot，包含上一次fiber树的全部信息
    //是代码里边主动渲染的渲染起点
    //当然render里边的currentRoot是最最开始，那是它还是null
    currentRoot = wipRoot;
    wipRoot = null;


  }

  function commitWork(fiber){
    if(!fiber){
      return
    }

    //在这里如果有Function Component对应的fiber
    //我们要越过去，找到真正的parent dom
    //fiber中有dom我们才操作
    let domParentFiber = fiber.parent
    while(!domParentFiber.dom){
      domParentFiber = domParentFiber.parent
    }
    //第一次是root，然后下边一层层递归
    // const domParent = fiber.parent.dom;
    const domParent = domParentFiber.dom;

    if(fiber.effectTag === "PLACEMENT" && fiber.dom != null){
      domParent.appendChild(fiber.dom);
    }else if(fiber.effectTag === "DELETION"){
      // domParent.removeChild(fiber.dom);
      // 因为funciton component在删除的时候，我们要删除
      // 真正有dom节点的子节点
      commitDeletion(fiber,domParent)
      
    }else if(fiber.effectTag ==="UPDATE" && fiber.dom !=null){
      //更新
      updateDom(fiber.dom,fiber.alternate.props,fiber.props);

    }
    //然后追加
    //domParent.appendChild(fiber.dom);
    //然后递归添加
    commitWork(fiber.child);
    commitWork(fiber.sibling);

  }

  function commitDeletion(fiber,domParent){
    if(fiber.dom){
      domParent.removeChild(fiber.dom);
    }else{
      //如果没有dom，递归找child的
      //链表和递归简直是天作之合
      commitDeletion(fiber.child,domParent);
    }
  }



  //render像是给了一个初始状态一样
  function render(element,container){
    //root 
    wipRoot = {
      dom:container,
      props:{
        children:[element]
      },
      alternate:currentRoot
    }
    deletions = [];
    //给一个初始工作空间
    //初始fiber，从根开始
    nextUnitOfWork = wipRoot;
  }

  let nextUnitOfWork= null;
  let wipRoot = null;
  let currentRoot = null;
  let deletions = null;


  function workLoop(deadline){
    let shouldYield = false;

    while(nextUnitOfWork && !shouldYield){
      //这里生成的是一整个fiber链表，起点就是传进来的根，
      //然后找到一个头之后，因为它的child、parent、sibling都挂载的有对象，我们可以一个个找下去
      //然后最终牵出整个链条，在下边渲染
      nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
      //deadline参数,我们可以用它来检查距离浏览器需要再次控制还有多少时间。
      shouldYield = deadline.timeRemaining()<1
    }

    if(!nextUnitOfWork && wipRoot){
      commitRoot();  //自动更新，render里边主要是个根
    }
    //requestIdleCallback相当于setTimeout,还为我们提供了deadline 在这算是递归吧
    requestIdleCallback(workLoop);

  }
  //requestIdleCallback是一个的新API，
  //requestIdleCallback接收一个回调，这个回调会在浏览器空闲时调用，每次调用会传入一个 IdleDeadline，可以拿到当前还空余多久
  requestIdleCallback(workLoop);


  //work in progress
  function performUnitOfWork(fiber){

    const isFunctionComponent = fiber.type instanceof Function
    //如果是函数组件
    if(isFunctionComponent){
      updateFunctionComponent(fiber);
    }else{
      updateHostComponent(fiber);
    }

    //第一次把child返回回去，下次进来再找child的child
    //往下一直找child，找到底
    if(fiber.child){
      return fiber.child
    }

    //如果没有child了，在树的最底层child开始找它的兄弟姐妹
    let nextFiber = fiber;


    while(nextFiber){
      //如果有兄弟 就返回兄弟
      if(nextFiber.sibling){
        return nextFiber.sibling
      }
      //如果没有兄弟了，找到父节点，注意这里没有返回
      //所以会继续循环，到while里的if寻找叔叔辈返回
      nextFiber = nextFiber.parent;
    }

  }

  //函数组件,又在里边加了一些钩子相关的东西
  let wipFiber = null;  
  let hookIndex = null;

  function updateFunctionComponent(fiber){
    
    //当前fiber，钩子索引，和钩子数组
    wipFiber = fiber;
    hookIndex = 0;
    wipFiber.hooks = [];

    //fiber.type是一个Function
    //然后加()运行，参数是fiber.props，
    //这个props，是函数的参数，传进来的name = "foo"
    //这个name在返回h1数据对象的时候要用
    //fiber.props和fiber.type是平级的，详见createElement
    //返回里边的h1标签
    const children = [fiber.type(fiber.props)];
    reconcileChildren(fiber,children)
  }

  function useState(initial){
    //todo
    const oldHook = 
      wipFiber.alternate && 
      wipFiber.alternate.hooks &&
      wipFiber.alternate.hooks[hookIndex];//返回了最后一个
    
    const hook = {
      state:oldHook?oldHook.state:initial,
      queue:[]
    }

    //==2.然后再下一次渲染组件的时候就会触发useState
    //render是fiber的开始,fiber结束就是commit，当然类比render也可以主动触发，见下边setState
    //从旧的钩子队列里获取动作队列
    const actions = oldHook ? oldHook.queue :[]
    //如果有就遍历变更状态方便后期commit更新,action是setState返回的函数
    actions.forEach(action => hook.state = action(hook.state))


    //setState本身也是需要触发的
    const setState = action =>{
      hook.queue.push(action);//将动作推送到我们添加了钩子的队列里

      //==1.设置一个新的工作区间，开始新一轮的渲染
      //每次渲染完之后会留下一个currentRoot，包含上一次fiber树的全部信息
      //是代码里边主动渲染的渲染起点
      wipRoot = {
        dom:currentRoot.dom,
        props:currentRoot.props,
        alternate:currentRoot
      }
      nextUnitOfWork = wipRoot;
      deletions = [];

    }

    wipFiber.hooks.push(hook);
    hookIndex ++;
    return [hook.state,setState]



  }


  //如果是hostComponent，也就是原来的数据结构
  function updateHostComponent(fiber){
    //如果传进来没有dom这里会新建
    if(!fiber.dom){
      fiber.dom = createDom(fiber);
    }

    /*
    //为了防止渲染不完成的dom，所以我们从这里删除变种dom
    //留到最后再渲染
    if(filter.parent){
       fiber.parent.dom.appendChild(fiber.dom);
    }
    */

    //create new fibers
    const elements = fiber.props.children
    //校对
    reconcileChildren(fiber,elements);
    
  }






  //diff,这部分很有意思
  function reconcileChildren(wipFiber, elements) {

    let index = 0
    //判断是否有旧的fiber，第一遍之后alternate就有值了
    let oldFiber = wipFiber.alternate  && wipFiber.alternate.child;
    let prevSibling = null


    //对children进行遍历
    //while里边只剩下两个重要的东西，oldFiber和element
    //这里主要是比对他们，然后把变化应用到dom
    while(index < elements.length || oldFiber != null){

      const element = elements[index];
      //这东西就是fiber的本来面目呀
      let newFiber = null;

      //type判断
      const sameType = 
        oldFiber && 
        element &&
        element.type === oldFiber.type
      //更新的时候，会用到oldFiber，也就是交替节点，这个出现在第一遍之后
      if(sameType){
        //todo update the node
        newFiber = {
          type:oldFiber.type,
          props:element.props,
          dom:oldFiber.dom,
          parent:wipFiber,
          alternate:oldFiber,
          effectTag:"UPDATE" //commit阶段使用
        }
      }

      if(element && !sameType){
        //todo add this node
        //需要新建dom节点
        newFiber = {
          type:element.type,
          props:element.props,
          dom:null,
          parent:wipFiber,
          alternate:null,//没有旧的
          effectTag:"PLACEMENT"
        }

        //dom设置为null返回新工作空间的时候就会新建
      }


      if(oldFiber && !sameType){
        //todo  delete the oldFiber's dom node
        oldFiber.effectTag = "DELETION";
        deletions.push(oldFiber);
      }

      if (oldFiber) {
        oldFiber = oldFiber.sibling
      }
  
      if (index === 0) {
        //1.我们知道index == 0的时候。newFiber的指针指向child
        wipFiber.child = newFiber 
      } else if (element) {
        //3.我们假设这里走到了index == 1，相当于在child的基础上加了sibling
        //以此类推
        prevSibling.sibling = newFiber
      }
  
      //2.index==0结束之后，我们又把wipFiber.child的指针给了prevSibling
      prevSibling = newFiber
      index++
      
    }
  }



  const qcact = {
    createElement,
    render,
    useState
    
  };
  
  //刚开始createElement只是存储dom信息，真正生成dom
  //是再createDom函数，而createDom是在fiber中进行的

  /** @jsx qcact.createElement */




  /*
  const element = (
     <div style="background: salmon">
       <h1>Hello World</h1>
       <h2 style="text-align:right">from qcact</h2>
     </div>
  );
  */
  
  /*
  const container = document.getElementById("root");

  //如果触发了事件，更改了child
  const updateValue = e => {
    //对比第一个old fiber tree 重新渲染一遍
    rerender(e.target.value)
  }

  const rerender = value =>{
    const element = (
      <div> 
        <input onInput={updateValue} value = {value}/>
        <h2 style="color:blue">Hello，{value}</h2>
        
      </div>
    )
    qcact.render(element,container);
  }

  //生产出第一个fiber tree
  rerender("World")

  */


  /*
  //function component
  function App(props){
    return <h1>Hi,{props.name}</h1>
  }
  const element = <App name="foo" />
  */


  //useState
  function Counter(){
    const [state,setState] = qcact.useState(1);
    return(
      <h1 onClick={()=>setState(c=>c+1)}>
        Count:{state}
      </h1>
    )
  }

  const element = <Counter />
  const container = document.getElementById("root");
  //相当于直接放进去一个Function
  //区别于之前的对象
  qcact.render(element,container);










  