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
          isNew(prevProps, nextProps)(key)
      )
      .forEach(name => {
        const eventType = name
          .toLowerCase()
          .substring(2)
        dom.removeEventListener(
          eventType,
          prevProps[name]
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


    commitWork(wipRoot.child);
    currentRoot = wipRoot;
    wipRoot = null;


  }

  function commitWork(fiber){
    if(!fiber){
      return
    }
    //访问父的也就是根
    const domParent = fiber.parent.dom;
    if(fiber.effectTag === "PLACEMENT" && fiber.dom != null){
      domParent.appendChild(fiber.dom);
    }else if(fiber.effectTag === "DELETION"){
      domParent.removeChild(fiber.dom);
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
    //初始fiber
    nextUnitOfWork = wipRoot;
  }

  let nextUnitOfWork= null;
  let wipRoot = null;
  let currentRoot = null;
  let deletions = null;


  function workLoop(deadline){
    let shouldYield = false;

    while(nextUnitOfWork && !shouldYield){
      //从这里开始一个个fiber的执行，
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


  function performUnitOfWork(fiber){
    //如果传进来没有dom这里会新建
    if(!fiber.dom){
      fiber.dom = createDom(fiber);
    }
    //为了防止渲染不完成的dom
    //所以我们从这里删除变种dom
    /*
    if(filter.parent){
       fiber.parent.dom.appendChild(fiber.dom);
    }
    */

    //create new fibers
    const elements = fiber.props.children
    //比较
    reconcileChildren(fiber,elements);
    


    //return next unit of work
    //如果有孩子
    if(fiber.child){
      return fiber.child
    }

    //b = [1,2,3]  *b取得是1，也就是child
    //对象也是类似于这样
    let nextFiber = fiber;

    //如果兄弟节点没有循环完，就一直循环下去
    while(nextFiber){
      //然后寻找child的兄弟节点，
      if(nextFiber.sibling){
        return nextFiber.sibling//返回兄弟fiber
      }
      //如果没有兄弟姐妹，让它去寻找叔叔吧
      nextFiber = nextFiber.parent;//返回到fiber的parent
    }

  }


  //diff,这部分很有意思
  function reconcileChildren(wipFiber, elements) {

    let index = 0
    //判断是否有旧的fiber
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
    render
  };
  
  /** @jsx qcact.createElement */
  const element = (
    <div style="background: salmon">
      <h1>Hello World</h1>
      <h2 style="text-align:right">from qcact</h2>
    </div>
  );
  
  const container = document.getElementById("root");
  qcact.render(element, container);
  