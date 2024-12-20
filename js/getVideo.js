/*************************************************************************
 * 监控直播调用 VER: 3.4.13
 *************************************************************************
 * 作者: xbear <13632795588>
 *************************************************************************
 * 2022.06.09
 *   修正设置自适应列数时，全屏时会自动退回到行内播放的 BUG
 *   支持拉伸至全屏播放（X5 内核浏览器）
 * 2022.06.10
 *   修正部分安卓微信不能播放的问题，改为使用 hls.js 插件播放
 * 2022.10.24
 *   兼容第三方播放地址
 * 2023.02.07
 *   修正 onloadedmetadata 在 onsuspend 后加载的 BUG
 * 2023.04.13
 *   限制最大重载次数
 *   视频状态使用后台自定义名称
 ************************************************************************/
"use strict";

function $id(id) {
  return new HLS(id);
}

/**
 * 创建类
 */
(function () {
  var HLS = function (id) {
    // 全局默认配置参数
    this.CONFIG = {
      api: "//cdn88.cn/api/", //API接口地址
      multi: false, //是否开启多通道协议
      debug: false, //是否启用本地调试
      logs: false, //是否启用前台日志调试(手机)
      alert: true, //是否弹出消息窗口
      timeout: 600, //连续播放时间限制(秒),0表示不限制
      reloadLimitTimes: 10, // 允许最大重载次数
      heartbeat: 300, //心跳连接服务器间隔时间(秒)
      login: true, //是否允许用户登录,显示登录窗口
      // 播放列表
      list: true, //是否显示播放列表
      filter: true, //是否过滤不在线的设备
      colNum: 0, //播放列表每行显示几列,0为自适应根据colWidth计算
      colWidth: 210, //播放列表每列最小宽度
      playinline: 1, //当行内列数小于或等于此值时,原地播放
      // 播放器
      player: "", //默认播放器[hls|hls-plugin|flash],空值为自动判断
      controller: true, //是否开启控制按钮(云台控制,分辨率,高/宽比)
      ratio: 0, //视频高/宽比例,不指定值则铺满上级容器
      res: 1, //flash播放器分辨率:默认1=辅码流，0=主码流
      buffer: 2, //flash播放器缓冲时间,默认2秒，网络较差时设置3秒
      flsPort: 1671, //flash播放器默认数据端口
      jsPath: "js/", //项目js文件夹路径
    };

    // HTML DOM Element 对象
    this.DOM = {};
    this.DOM.element = document.getElementById(id);
    this.DOM.id = id; //yst-video-box
    this.DOM.className = this.DOM.element.getAttribute("class"); //video-box
    this.DOM.title = document.title;
    this.DOM.login = {
      //登录表单
      element: null,
      id: id + "-login",
      className: this.DOM.className + "-login",
    };
    this.DOM.logout = {
      //注销表单
      element: null,
      id: id + "-logout",
      className: this.DOM.className + "-logout",
    };
    this.DOM.wrap = {
      //播放器默认容器
      element: null,
      id: id + "-wrap",
      className: this.DOM.className + "-wrap",
    };
    this.DOM.player = {
      //播放器
      element: null,
      id: id + "-player",
      className: this.DOM.className + "-player",
    };
    this.DOM.controller = {
      //云台控制
      element: null,
      id: id + "-controller",
      className: this.DOM.className + "-controller",
    };
    this.DOM.list = {
      //播放列表
      element: null,
      id: id + "-list",
      className: this.DOM.className + "-list",
    };
    this.DOM.logs = {
      //日志
      element: null,
      id: id + "-logs",
      className: this.DOM.className + "-logs",
    };

    // 监看请求参数
    this.REQUEST = {
      token: "", //口令
      req: {}, //当前请求参数,合并(def<js<data<storage<url<form)
      form: {}, //表单提交参数
      url: {}, //url请求参数
      storage: {}, //本地存储参数
      data: {}, //data属性参数
      js: {}, //js传参
      def: {
        //默认参数
        ip: "", //中心服务器ip地址,可选
        port: undefined, //中心服务器端口,可选
        user: "", //登录账号
        password: "", //密码，无密码可忽略
        dev: null, //摄像头SN，多个用英文逗号隔开
        remember: false, //是否记住登录信息
      },
    };

    // 视频参数
    this.VIDEO = {
      player: "", //默认首选播放器,hls|hls-plugin|flash
      plugin: null, //new hls插件
      isLoadPlugin: false, //hls插件已加载
      wrap: null, //临时存放播放容器DOM
      colNum: 0, //当前每行显示的设备列表数
      list: {}, //播放列表
      request: {
        // 请求播放的设备
        sn: "", //请求播放的设备序列号
        name: "", //请求播放的设备名称
        hlsurl: "", //请求播放的设备HLS地址
        imgsrc: "", //请求播放的设备缩略图地址
        ip: "", //请求播放的设备所在服务器IP
        flsPort: "", //请求播放的设备所在服务器FLASH端口
        flsurl: "", //请求播放的设备FLS地址
      },
      playing: {
        // 同 request
      },
      beginTime: null, //开始播放时间戳
      endTime: null, //结束播放时间戳
      currentTime: null, //开始播放位置
      lastTime: null, //最后播放位置
      heartbeatInterval: null, //心跳连接
      reloadInterval: null, //重载视频定时器
      reloadTimes: 0, // 已重载次数
      timeout: 0, //超时时间(秒)
      state: null, //播放状态
      control: 0, //当前云台控制指令队列，有几个就是几个
      mouseEvent: {
        //鼠标事件
        handler: null, //事件类型['onclick|']
        times: 0, //鼠标点击次数
        x: null, //X坐标
        y: null, //Y坐标
        timeout: null, //延时招行事件
      },
    };
  };

  // 用户请求监看参数
  HLS.prototype.getVideo = function (request) {
    this.REQUEST.url = this.filter(xbear.urlParms());
    this.REQUEST.storage = this.filter(
      (this.CONFIG.login && sessionStorage.getItem(this.DOM.id + "-token")) ||
        localStorage.getItem(this.DOM.id + "-token") ||
        ""
    );
    this.REQUEST.data = this.filter(xbear.data(this.DOM.element));
    this.REQUEST.js = this.filter(request);
    // form>url>storage>data>js>def = req
    this.REQUEST.req = this.filter(
      xbear.extend(
        {},
        this.REQUEST.def,
        this.REQUEST.js,
        this.REQUEST.data,
        this.REQUEST.storage,
        this.REQUEST.url
      )
    );
    // 处理参数
    this.printf(this.REQUEST, 3, "REQUEST");
    this.printf(this.VIDEO, 3, "VIDEO");

    // 创建DOM模型树之前需判断父级高度
    // 父级有指定高度时不能溢出父级 styleHeight || clientHeight<offsetHeight<scrollHeight

    //var parent = this.DOM.element.parentNode;
    //this.printf(parent,1,'parent'); //
    //this.printf(parent.clientHeight,1,'clientHeight'); //100
    //this.printf(parent.offsetHeight,1,'offsetHeight'); //102
    //this.printf(parent.scrollHeight,1,'scrollHeight'); //734
    //this.printf(parent.style.height,1,'style height'); // none
    //this.printf(window.getComputedStyle(parent).height,1,'getComputedStyle');//IE不支持

    var pHeight = this.DOM.element.parentNode.clientHeight;
    //var pChildNum = this.DOM.element.parentNode.childNodes.length; //会获取到文本节点
    var pChildNum = this.DOM.element.parentNode.children.length;
    this.printf(pHeight, 1, "pHeight");
    if (pHeight > 50) {
      //修正需要去掉border,magin,padding
      this.DOM.element.style.overflow = "auto";
    } else {
      // 父级未设置高度，需设置默认比例，解决播放窗口异常
      this.CONFIG.ratio = this.CONFIG.ratio || 0.5625;
    }

    if (pChildNum > 1) {
      //父级有多个子元素
      this.DOM.element.style.height = "auto";
    } else if (pHeight > 50) {
      //仅本子元素,且有设置高度
      this.DOM.element.style.minHeight = pHeight + "px";
    }

    // 创建DOM模型树
    this.createDom();

    // 尝试登录
    this.login();

    return this;
  };

  // 用户自定义配置参数
  HLS.prototype.config = function (config) {
    this.CONFIG = xbear.extend(this.CONFIG, config);
    this.printf(this.CONFIG, 3, "CONFIG");
    this.printf(this.DOM, 1, "DOM");
    return this;
  };

  // 解析参数
  HLS.prototype.filter = function (params) {
    //尝试转换为对象
    if (typeof params !== "object") {
      try {
        // 尝试json格式化
        params = JSON.parse(params);
      } catch (e) {
        try {
          // 尝试解码后再次json格式化
          params = JSON.parse(xbear.base64.decode2(params));
        } catch (e) {
          // 二次尝试后终止
          params = {};
        }
      }
    }
    //尝试子项转换为对象
    if (!!params.q) {
      try {
        params.q = JSON.parse(params.q);
      } catch (e) {
        try {
          // 尝试解码后再次json格式化
          params.q = JSON.parse(xbear.base64.decode2(params.q));
        } catch (e) {
          // 二次尝试后终止
          params.q = {};
        }
      }
      params = xbear.extend({}, params, params.q);
      delete params.q;
    }
    return params;
  };

  // 登录
  HLS.prototype.login = function () {
    this.printf(this.REQUEST.req, 3, "登录");
    if (!!this.REQUEST.req.user) {
      //登录校验
      if (this.CONFIG.login) this.DOM.login.element.style.display = "none";
      this.loginRequest();
    } else {
      //发送请求，可以传参(提示类型)
      this.printf("账号为空", (this.CONFIG.login && 3) || 7);
      this.logout();
    }
  };

  // 注销登录
  HLS.prototype.logout = function () {
    this.printf("注销", 3);
    this.DOM.wrap.element.style.display = "none";
    this.DOM.player.element.style.display = "none";
    this.DOM.controller.element.style.display = "none";
    // 清除播放列表
    if (this.CONFIG.list) {
      this.DOM.list.element.style.display = "none";
      this.DOM.list.element.innerHTML = "";
    }
    // 停止播放
    this.stopPlay();
    // 重置数据
    this.VIDEO.list = {};
    this.VIDEO.request = {};
    //this.VIDEO.playing = {};

    // 清除浏览器缓存
    try {
      sessionStorage.removeItem(this.DOM.id + "-token");
      localStorage.removeItem(this.DOM.id + "-token");
    } catch (e) {}

    // 显示登录窗口
    if (this.CONFIG.login) {
      this.DOM.logout.element.style.display = "none";
      this.DOM.login.element.style.display = "block";
      // 重置登录窗口的垂直居中
      var boxHeight = this.DOM.element.clientHeight;
      var loginHeight = this.DOM.login.element.clientHeight;
      // 容器高度大于登录窗口最小高度，容器窗口大于浏览器高度时取浏览器高度
      boxHeight = boxHeight > 600 ? 600 : boxHeight;
      if (boxHeight > loginHeight) {
        var marginTop = Math.ceil((boxHeight - loginHeight) / 2) + "px";
        this.DOM.login.element.style.marginTop = marginTop;
      }
    }
  };

  // 登录请求
  HLS.prototype.loginRequest = function () {
    // 处理传入参数
    var request = this.REQUEST.req;
    this.REQUEST.token = xbear.base64.encode2(JSON.stringify(request));
    request.password =
      request.password.length == 32
        ? request.password
        : xbear.md5(request.password);
    request.dev = this.explodeDev(request.dev) || null;
    this.printf(request, 3, "登录请求");

    if (!request.user) return false;

    var params = {};
    params.json = JSON.stringify({
      cmdId: 100,
      ip: request.ip,
      port: request.port,
      user: request.user,
      password: request.password,
      autostart: !!request.dev,
      dev: request.dev,
      filter: this.CONFIG.filter,
      stream_type: parseInt(request.stream_type),
      channel_id: parseInt(request.channel_id),
      sorter: request.sorter,
    });

    //发送登录请求
    this.printf(params, 3, "登录请求参数");
    var _this = this;
    xbear.post(this.CONFIG.api, params, function (data) {
      //post
      try {
        data = JSON.parse(data);
      } catch (e) {}
      _this.printf(data, 3, "登录请求返回");
      //登录成功
      if (data.result == 0) {
        _this.printf("登录成功", 3);
        // 保存会话token
        if (request.remember) {
          try {
            localStorage.setItem(_this.DOM.id + "-token", _this.REQUEST.token);
          } catch (e) {}
          _this.DOM.logout.element.style.display = "block";
        }
        // 仅允许登录的情况下才保存到sessionStorage
        if (_this.CONFIG.login) {
          try {
            sessionStorage.setItem(
              _this.DOM.id + "-token",
              _this.REQUEST.token
            );
          } catch (e) {}
        }
        // 播放列表为空
        if (data.devlist.length == 0) {
          _this.printf("无设备在线", 7);
          _this.logout();
        }
        // 单个设备在线或禁止列表显示
        else if (data.devlist.length == 1 || !_this.CONFIG.list) {
          _this.DOM.wrap.element.style.display = "block";
          _this.VIDEO.request = data.devlist[0];
          _this.callPlayer();
        }
        // 长度大于1时生成列表
        else {
          _this.DOM.wrap.element.style.display = "none";
          _this.VIDEO.list = data.devlist;
          _this.createListDom(data.devlist);
        }
      }
      //登录异常
      else {
        var msg = MSG[data.result] || {
          content: "登录失败",
          type: 7,
        };
        _this.printf(msg.content, msg.type);
        _this.logout();
        return false;
      }
    });
  };

  // 登录请求（多通道）
  HLS.prototype.loginRequestMulti = function () {};

  // 监看请求
  HLS.prototype.playRequest = function () {
    this.printf("监看请求", 3);
    clearInterval(this.VIDEO.heartbeatInterval);
    // 处理传入参数
    var request = this.REQUEST.req;
    if (!request.user) return false;

    var params = {};
    params.json = JSON.stringify({
      cmdId: 210,
      ip: request.ip,
      port: request.port,
      user: request.user,
      password: request.password,
      devId: this.VIDEO.request.sn,
      // 原生210为小写
      streamtype: parseInt(request.stream_type),
      channelid: parseInt(request.channel_id),
    });

    //发送监看请求
    this.printf(params, 3, "监看请求参数");
    var _this = this;
    xbear.post(this.CONFIG.api, params, function (data) {
      try {
        data = JSON.parse(data);
      } catch (e) {}
      _this.printf(data, 3, "监看请求返回");
      // 监看请求成功
      if (data.hlsurl) {
        // 准备下一次心跳连接
        _this.VIDEO.heartbeatInterval = setInterval(function () {
          _this.printf("监看请求-心跳连接", 3);
          _this.playRequest();
        }, _this.CONFIG.heartbeat * 1000);
        // 如果为多服务器,需更新播放地址及缩略图地址
        _this.VIDEO.request = xbear.extend({}, _this.VIDEO.request, data);
        // 开始播放
        _this.hlsPlayer();
      }
      // 监看请求异常
      else {
        var msg = MSG[data.result] || {
          content: "请求失败",
          type: 7,
        };
        _this.printf(msg.content, msg.type);
        // 停止播放
        _this.stopPlay();
      }
    });
  };

  // 云台控制请求 //channelId, ctrlType, Intensity
  /**
   *
   * @param {Object} dir 云台控制方向[up|down|left|right|zoomin|zoomout]
   * @param {Object} time 云台控制时间
   */
  HLS.prototype.controlRequest = function (dir, time) {
    var _this = this;
    // 处理处理传入
    time = time || 1000;
    var cmd =
      (dir === "up" && [1, 2, 50]) ||
      (dir === "down" && [1, 3, 50]) ||
      (dir === "left" && [1, 4, 50]) ||
      (dir === "right" && [1, 5, 50]) ||
      (dir === "zoomin" && [1, 8, 50]) ||
      (dir === "zoomout" && [1, 9, 50]) ||
      null;
    var request = this.REQUEST.req;
    // 传入参数检查
    if (
      !this.VIDEO.request.sn ||
      !request.user ||
      !cmd ||
      this.VIDEO.state !== "onplay"
    ) {
      if (!this.VIDEO.control) this.resetMouseEvent();
      return false;
    }
    // 控制器队列加1
    this.VIDEO.control++;
    this.printf(
      dir + "=" + time + "(" + this.VIDEO.control + ")",
      3,
      "云台控制"
    );
    _this.DOM.controller.element.firstChild.className = dir;

    var params = {};
    params.json = JSON.stringify({
      cmdId: 300,
      ip: request.ip,
      port: request.port,
      user: request.user,
      password: request.password,
      devId: this.VIDEO.request.sn,
      channelId: cmd[0],
      ctrlType: cmd[1],
      Intensity: cmd[2],
    });

    //发送云台控制命令
    //this.printf(params, 3, '云台控制');
    xbear.post(this.CONFIG.api, params, function (data) {
      // 可以无需返回
      try {
        data = JSON.parse(data);
      } catch (e) {}
      _this.printf(data, 1, "控制返回");
      if (data.result) {
        var msg = MSG[data.result] || {
          content: "控制失败",
          type: 3,
        };
        _this.printf(msg.content, msg.type);
      }
    });
    // 发送停止命令
    cmd =
      (dir === "up" && [1, 16, 50]) ||
      (dir === "down" && [1, 17, 50]) ||
      (dir === "left" && [1, 18, 50]) ||
      (dir === "right" && [1, 19, 50]) ||
      (dir === "zoomin" && [1, 24, 50]) ||
      (dir === "zoomout" && [1, 25, 50]) ||
      [];
    params.json = JSON.stringify({
      cmdId: 300,
      ip: request.ip,
      port: request.port,
      user: request.user,
      password: request.password,
      devId: this.VIDEO.request.sn,
      channelId: cmd[0],
      ctrlType: cmd[1],
      Intensity: cmd[2],
    });
    setTimeout(function () {
      xbear.post(_this.CONFIG.api, params, function (data) {});
      _this.VIDEO.control--; //控制器队列减1
      // 重置鼠标事件,控制指令处理完毕后执行
      if (!_this.VIDEO.control) _this.resetMouseEvent();
      _this.DOM.controller.element.firstChild.className = "onplay";
    }, time);
  };

  // 调用播放器
  HLS.prototype.callPlayer = function () {
    var _this = this;
    this.printf("播放准备", 3);
    document.title = this.VIDEO.request.name + " - " + this.DOM.title;
    if (this.VIDEO.player === "hls" || this.VIDEO.isLoadPlugin) {
      this.playRequest();
    } else if (this.VIDEO.player === "hls-plugin") {
      this.printf("加载HLS插件", 3);
      //this.VIDEO.isLoadPlugin = true;
      //xbear.loadJs(this.CONFIG.jsPath + 'hls.light.min.js', this.playRequest());
      xbear.loadJs(this.CONFIG.jsPath + "hls.light.min.js", function () {
        _this.VIDEO.isLoadPlugin = true;
        _this.playRequest();
      });
    } else {
      this.flashPlayer();
    }
  };

  // HLS播放器
  HLS.prototype.hlsPlayer = function () {
    this.printf("调用HLS播放器", 3);
    var basetime = 2000; //重载基准时间(毫秒)
    var player = this.DOM.player.element;
    var _this = this;

    // 无效的播放地址
    if (!this.VIDEO.request.hlsurl) {
      this.printf("无效的播放地址", 3);
      return false;
    }
    // 重复请求/心跳
    if (this.VIDEO.request.hlsurl === this.VIDEO.playing.hlsurl) {
      return false;
    }

    // 初始化播放信息
    this.VIDEO.beginTime = null;
    this.VIDEO.endTime = null;
    this.VIDEO.timeout = 0;
    this.VIDEO.reloadTimes = 0;
    this.VIDEO.currentTime = null;
    this.VIDEO.lastTime = null;
    this.VIDEO.state = "onload";
    // 变量会污染
    this.VIDEO.playing = this.VIDEO.request;
    //this.VIDEO.playing = xbear.extend({},this.VIDEO.request);
    // 设置播放位置
    this.movePlayer();
    // 显示播放器
    player.style.display = "block";
    //加载视频
    player.src = this.VIDEO.request.hlsurl;
    player.poster = this.VIDEO.request.imgsrc;
    this.printf(player.src, 3, "加载视频");
    // BUG:IOS微信下按钮可以触发，本程序不能触发load事件
    player.load();
    this.DOM.controller.element.firstChild.className = "onload";
    // 允许手动触发播放事件,onloadedmetadata,onsuspend
    //_this.DOM.controller.element.style.display = 'none';

    //播放器事件
    //视频加载中
    player.onloadstart = function () {
      if (!_this.VIDEO.state) return false;
      _this.VIDEO.state = "onloadstart";
      _this.printf(_this.VIDEO.state, 3);
      _this.reloadPlay(basetime);
      _this.DOM.controller.element.firstChild.className = "onload";
    };
    //视频的元数据/视频信息已加载!
    //可能在 onsuspend 后才加载完成
    player.onloadedmetadata = function () {
      if (_this.VIDEO.state !== "onsuspend")
        _this.VIDEO.state = "onloadedmetadata";
      _this.printf(_this.VIDEO.state, 3);
      // 定时状态检测
      _this.VIDEO.beginTime = Date.parse(new Date());
      _this.reloadPlay(basetime * 5);
      // 允许手动触发播放事件
      _this.DOM.controller.element.style.display = "none";
      player.setAttribute("controls", "controls");
    };
    //开始播放
    player.onplay = function () {
      // 视频就绪
      if (player.readyState > 2) {
        _this.VIDEO.state = "onplay";
        _this.printf(_this.VIDEO.state, 3);
        _this.reloadPlay(basetime * 5);
        _this.DOM.controller.element.firstChild.className = "onplay";
        // 手动触发播放后，再次开启遮挡
        _this.DOM.controller.element.style.display = "block";
        player.removeAttribute("controls");
      }
    };
    //暂停播放
    player.onpause = function () {
      // 视频就绪后
      if (player.readyState > 2) {
        _this.VIDEO.state = "onpause";
        _this.printf(_this.VIDEO.state, 3);
        _this.reloadPlay(basetime * 5);
        _this.DOM.controller.element.firstChild.className = "onpause";
        // 允许手动触发播放事件
        _this.DOM.controller.element.style.display = "none";
        player.setAttribute("controls", "controls");
      }
    };
    //视频缓冲中
    //player.onwaiting = function() {
    //	_this.printf("onwaiting");
    //}
    //视频下载中
    //player.onprogress = function() {
    //	_this.printf("onprogress");
    //}
    //发生错误,部分机型触发 onsuspend 但不会触发 onerror
    player.onerror = function () {
      if (!_this.VIDEO.state) return false;
      _this.VIDEO.state = "onerror";
      _this.printf(_this.VIDEO.state + ":" + player.error.code, 3);
      _this.reloadPlay(basetime);
      //1 = MEDIA_ERR_ABORTED - 取回过程被用户中止
      //2 = MEDIA_ERR_NETWORK - 当下载时发生错误
      //3 = MEDIA_ERR_DECODE - 当解码时发生错误
      //4 = MEDIA_ERR_SRC_NOT_SUPPORTED - 不支持音频/视频
    };
    //媒体数据被阻止加载,不支持解码,onerror=4
    player.onsuspend = function () {
      if (!_this.VIDEO.state) return false;
      _this.VIDEO.state = "onsuspend";
      _this.printf(_this.VIDEO.state, 3);
      // 允许手动触发播放事件
      _this.DOM.controller.element.style.display = "none";
      player.setAttribute("controls", "controls");
      _this.reloadPlay(basetime);
    };
    //播放结束
    player.onended = function () {
      _this.VIDEO.state = "onended";
      _this.printf(_this.VIDEO.state, 3);
      clearInterval(_this.VIDEO.reloadInterval);
    };
  };

  // HLS插件播放器
  HLS.prototype.hlsPluginPlayer = function () {
    this.printf(this.VIDEO.isLoadPlugin, 3, "调用HLS插件");
    if (!this.VIDEO.isLoadPlugin) {
      this.printf("HLS插件未加载", 7);
      return false;
    }
    //console.log(window);
    this.VIDEO.plugin = new Hls();
    this.VIDEO.plugin.loadSource(this.VIDEO.request.hlsurl);
    this.VIDEO.plugin.attachMedia(this.DOM.player.element);
    //监听
    //var _this = this;
    //this.VIDEO.plugin.on(Hls.Events.MANIFEST_PARSED, function() {
    //	_this.DOM.player.element.play();
    //});
  };

  // FLASH播放器
  HLS.prototype.flashPlayer = function () {
    this.printf("调用FLASH播放", 3);
    var _this = this;
    var basetime = 10000; //重载基准时间(毫秒)

    //处理播放地址
    var ip = this.VIDEO.request.ip || this.REQUEST.req.ip;
    var port = this.VIDEO.request.flsPort || this.CONFIG.flsPort || 1671;
    var user = this.REQUEST.req.user;
    var password = this.REQUEST.req.password;
    var sn = this.VIDEO.request.sn;
    var res = this.CONFIG.res || 1;
    var buffer = this.CONFIG.buffer || 2;
    var flsurl = (this.VIDEO.request.flsurl =
      this.VIDEO.request.flsurl ||
      ip +
        ":" +
        port +
        "||" +
        user +
        "||" +
        sn +
        "||" +
        res +
        "||" +
        password +
        "||" +
        buffer);
    var swfPath = this.CONFIG.jsPath + "player" + port + ".swf";

    //this.printf(swfPath,3,'swfPath');
    this.printf(flsurl, 3, "flsurl");

    // 重复请求
    if (this.VIDEO.request.flsurl === this.VIDEO.playing.flsurl) {
      return false;
    }

    // 加载播放器
    // 让Flash不档住浮动对象或层
    // <param name="wmode" value="opaque" /> // IE
    // 针对FF 在<embed />内加上参数wmode="opaque"
    // <param name="wmode" value="transparent"> 或设置为透明

    var html =
      '<object classid="clsid:d27cdb6e-ae6d-11cf-96b8-444553540000" codebase="http://fpdownload.macromedia.com/pub/shockwave/cabs/flash/swflash.cab#version=8,0,0,0" class="' +
      this.DOM.player.className +
      '" id="' +
      this.DOM.player.id +
      '" width="100%" height="100%"><param name="movie" value="' +
      swfPath +
      '"><param name="quality" value="high"><param name="scale" value="noborder"><param name="bgcolor" value="#ffffff"><param name="allowScriptAccess" value="always"><param name="allowFullScreen" value="true"><param name="FlashVars" value="param=' +
      flsurl +
      '"><param name="wmode" value="opaque" /><embed wmode="opaque" src="' +
      swfPath +
      '" quality="high" scale="noborder" bgcolor="#ffffff" width="100%" height="100%" allowFullScreen="true" allowScriptAccess="always" FlashVars="param=' +
      flsurl +
      '" type="application/x-shockwave-flash" pluginspage="http://www.macromedia.com/go/getflashplayer"></embed></object>';
    this.DOM.element.appendChild(this.DOM.controller.element);
    this.DOM.wrap.element.innerHTML = html;
    this.DOM.player.element = document.getElementById(this.DOM.player.id);
    this.VIDEO.playing = this.VIDEO.request;
    // 初始化播放信息
    this.VIDEO.state = "onload";
    this.DOM.controller.element.firstChild.className = "onload";
    // 设置播放位置
    this.movePlayer();
    this.DOM.player.element.style.display = "block";
    //this.DOM.player.element.style.width = "1px";
    // 开始加载时设置FLASH可点击(chrome需要手动触发)
    _this.DOM.controller.element.style.display = "none";
    // 延时显示视频并增加控制层
    setTimeout(function () {
      _this.VIDEO.beginTime = Date.parse(new Date());
      _this.VIDEO.endTime = _this.VIDEO.beginTime;
      _this.VIDEO.timeout = 0;
      _this.VIDEO.reloadTimes = 0;
      _this.VIDEO.state = "onplay";
      _this.DOM.controller.element.firstChild.className = "onplay";
      _this.DOM.controller.element.style.display = "block";
      //_this.DOM.player.element.style.width = "100%";
    }, buffer * 2000);

    // 重载
    this.reloadPlay(basetime);
  };

  // 播放器选择
  HLS.prototype.choosePlayer = function (element) {
    if (
      typeof element.canPlayType !== "undefined" &&
      element.canPlayType("application/vnd.apple.mpegurl")
    ) {
      return "hls";
    } else {
      var mediaSource =
        (typeof window !== "undefined" &&
          (window.MediaSource || window.WebKitMediaSource)) ||
        null;
      var sourceBuffer = window.SourceBuffer || window.WebKitSourceBuffer;
      var isTypeSupported =
        mediaSource &&
        typeof mediaSource.isTypeSupported === "function" &&
        mediaSource.isTypeSupported(
          'video/mp4; codecs="avc1.42E01E,mp4a.40.2"'
        );

      var sourceBufferValidAPI =
        !sourceBuffer ||
        (sourceBuffer.prototype &&
          typeof sourceBuffer.prototype.appendBuffer === "function" &&
          typeof sourceBuffer.prototype.remove === "function");
      return (
        (!!isTypeSupported && !!sourceBufferValidAPI && "hls-plugin") || "flash"
      );
    }
  };

  // 结束播放
  HLS.prototype.stopPlay = function () {
    this.printf("停止播放", 3);
    var player = this.DOM.player.element;
    player.style.display = "none";
    this.DOM.controller.element.style.display = "none";
    // 处理控制器,隐藏+移走防止FLASH模式时被删除
    this.DOM.controller.element.firstChild.className = "onend";
    // 清空播放信息
    this.VIDEO.playing = {};
    this.VIDEO.state = null;
    this.VIDEO.reloadTimes = 0;
    // 暂停,部分手机会一直播放
    if (this.VIDEO.player === "hls" || this.VIDEO.player === "hls-plugin") {
      player.pause();
      player.src = "";
      clearInterval(this.VIDEO.heartbeatInterval);
      //销毁Hls插件实例
      try {
        this.VIDEO.plugin.destroy();
        this.VIDEO.plugin = null;
      } catch (e) {}
    } else {
      //flash播放器需要销毁
      // player.parentNode.removeChild(player);在IE下会报错
      // 移回到默认播放容器,删除播放器
      this.DOM.wrap.element.appendChild(player);
      this.DOM.wrap.element.removeChild(player);
    }
    clearInterval(this.VIDEO.reloadInterval);
  };

  // 播放重载
  HLS.prototype.reloadPlay = function (time) {
    var _this = this;
    var player = this.DOM.player.element;
    //清除重载计时器
    clearInterval(this.VIDEO.reloadInterval);
    //无传入时间、播放超时、无播放状态(未开始或已停止)
    if (
      !time ||
      this.VIDEO.timeout ||
      !this.VIDEO.state ||
      (this.CONFIG.reloadLimitTimes &&
        this.VIDEO.reloadTimes >= this.CONFIG.reloadLimitTimes)
    ) {
      return false;
    }
    //定义重载 video.reloadInterval
    this.VIDEO.reloadInterval = setInterval(function () {
      if (_this.VIDEO.player === "hls" || _this.VIDEO.player === "hls-plugin") {
        //当前播放位置(秒)
        _this.VIDEO.currentTime = parseInt(player.currentTime);
        //帧数据可用,且不为暂停播放状态
        if (_this.VIDEO.state !== "onpause" && player.readyState > 2) {
          _this.VIDEO.reloadTimes = 0;
          player.play();
        }
        // 不支持的音视频格式
        if (
          _this.VIDEO.state === "onsuspend" &&
          _this.VIDEO.player !== "hls-plugin"
        ) {
          _this.printf(
            `${_this.VIDEO.player}:${_this.VIDEO.state},尝试使用插件播放...`,
            3
          );
          xbear.loadJs(_this.CONFIG.jsPath + "hls.light.min.js", function () {
            _this.VIDEO.isLoadPlugin = true;
            _this.VIDEO.player = "hls-plugin";
            _this.hlsPluginPlayer();
          });
        }
        // 检查播放是
        else if (
          !player.readyState ||
          (_this.VIDEO.state !== "onpause" &&
            _this.VIDEO.lastTime === _this.VIDEO.currentTime)
        ) {
          _this.VIDEO.reloadTimes++;
          //异常原因已停止播放
          _this.printf(
            `${_this.VIDEO.player}:${_this.VIDEO.state},reloading...${_this.VIDEO.reloadTimes}`,
            3
          );
          if (_this.VIDEO.player === "hls-plugin") {
            _this.hlsPluginPlayer();
          } else {
            player.src = `${_this.VIDEO.request.hlsurl}#try_${_this.VIDEO.reloadTimes}`;
            player.load();
          }
        }
        //将当前播放时间设置为最后播放时间,下次检测以此为基准
        _this.VIDEO.lastTime = _this.VIDEO.currentTime
          ? _this.VIDEO.currentTime
          : null;
      }

      // 如果设置了超时限制且已开始播放
      if (_this.CONFIG.timeout && _this.VIDEO.beginTime) {
        // 播放结束时间戳
        var now = new Date();
        _this.VIDEO.endTime = Date.parse(now);
        // 取整秒,修正误差1秒
        _this.VIDEO.timeout =
          (_this.VIDEO.endTime - _this.VIDEO.beginTime) / 1000;
        _this.printf("播放持续时间" + ":" + _this.VIDEO.timeout, 3);
        _this.VIDEO.timeout =
          _this.VIDEO.timeout >= _this.CONFIG.timeout
            ? _this.VIDEO.timeout - _this.CONFIG.timeout + 1
            : 0;
      }

      // 已超时
      if (_this.VIDEO.timeout) {
        _this.printf("播放超时:" + now.toString(), 3);
        _this.stopPlay();
        return false;
      }
    }, time);
  };

  // 预创建DOM树:主干
  HLS.prototype.createDom = function () {
    this.printf("创建DOM模型", 3);
    var _this = this;
    var request = this.REQUEST.req;
    var html = "";
    // 登录窗口
    if (this.CONFIG.login && !this.DOM.login.element) {
      html +=
        '<form class="' +
        this.DOM.login.className +
        '" id="' +
        this.DOM.login.id +
        '">';
      // login ip default hide
      //html += '<div><label for="' + this.DOM.login.id + '-ip">服务器：</label><input type="text" id="' + this.DOM.login.id + '-ip" placeholder="ip" value="' + request.ip + '"></div>';
      // login user
      html +=
        '<div><label for="' + this.DOM.login.id + '-user">用户名：</label>';
      html +=
        '<input type="text" id="' +
        this.DOM.login.id +
        '-user" placeholder="user" value="' +
        request.user +
        '"></div>';
      // login password
      html +=
        '<div><label for="' + this.DOM.login.id + '-password">密码：</label>';
      html +=
        '<input type="password" id="' +
        this.DOM.login.id +
        '-password" placeholder="password" value="' +
        request.password +
        '"></div>';
      // login remember
      var checked = request.remember ? ' checked="checked"' : "";
      html +=
        '<label class="checkbox"><input type="checkbox" id="' +
        this.DOM.login.id +
        '-remember"' +
        checked +
        "> 记住密码</label>";
      // login submit
      html +=
        '<button type="submit" class="' +
        this.DOM.className +
        '-submit">登录</button>';
      html += "</form>";
    }
    // 播放器
    if (!this.DOM.wrap.element) {
      // player Wrap
      html +=
        '<div class="' +
        this.DOM.wrap.className +
        '" id="' +
        this.DOM.wrap.id +
        '">';
      // player
      html +=
        '<video class="' +
        this.DOM.player.className +
        '" id="' +
        this.DOM.player.id +
        '" src="" controls autoplay loop muted x5-player playsinline x5-playsinline webkit-playsinline x-webkit-airplay="allow" x5-video-player-type="h5" x5­-video­-player­-fullscreen></video>';
      // controller
      html +=
        '<div class="' +
        this.DOM.controller.className +
        '" id="' +
        this.DOM.controller.id +
        '">';
      html += "<div></div><iframe></iframe></div></div>";
    }
    // 播放列表
    if (this.CONFIG.list && !this.DOM.list.element) {
      html +=
        '<ul class="' +
        this.DOM.list.className +
        '" id="' +
        this.DOM.list.id +
        '"></ul>';
    }
    // 退出登录
    if (this.CONFIG.login && !this.DOM.logout.element) {
      html +=
        '<div class="' +
        this.DOM.logout.className +
        '"><button type="button" class="' +
        this.DOM.className +
        '-submit" id="' +
        this.DOM.logout.id +
        '">注销</button></div>';
    }
    // 日志
    if (this.CONFIG.logs && !this.DOM.logs.element) {
      html +=
        '<textarea class="' +
        this.DOM.logs.className +
        '" id="' +
        this.DOM.logs.id +
        '"></textarea>';
    }
    // 生成html
    this.DOM.element.innerHTML = html;

    // DOM login + logout
    if (this.CONFIG.login) {
      this.DOM.login.element = document.getElementById(this.DOM.login.id);
      this.DOM.logout.element = document.getElementById(this.DOM.logout.id);
      this.DOM.login.element.style.display = "none";
      this.DOM.logout.element.style.display = "none";
    }

    // DOM wrap + player
    this.DOM.wrap.element = document.getElementById(this.DOM.wrap.id);
    this.DOM.wrap.element.style.display = "none";
    // 设置播放器容器比例：响应式
    this.setRatio(this.DOM.wrap.element, this.CONFIG.ratio);
    this.DOM.player.element = document.getElementById(this.DOM.player.id);
    // 如调用FLASH,会清除导致IE8抛出没有对象错误
    if (this.DOM.player.element) this.DOM.player.element.style.display = "none";
    // DOM controller
    this.DOM.controller.element = document.getElementById(
      this.DOM.controller.id
    );
    this.DOM.controller.element.style.display = "none";
    // DOM list
    if (this.CONFIG.list) {
      this.DOM.list.element = document.getElementById(this.DOM.list.id);
      this.DOM.list.element.style.display = "none";
    }
    // DOM logs
    if (this.CONFIG.logs) {
      this.DOM.logs.element = document.getElementById(this.DOM.logs.id);
      this.DOM.element.appendChild(this.DOM.logs.element);
    }

    // 播放器判断
    this.VIDEO.player =
      this.CONFIG.player || this.choosePlayer(this.DOM.player.element);

    // 绑定事件
    // 登录
    if (_this.CONFIG.login) {
      _this.DOM.login.element.onsubmit = function () {
        try {
          event.preventDefault(); // 兼容标准浏览器
        } catch (e) {
          window.event.returnValue = false; // 兼容IE6~8
        }
        //_this.REQUEST.ip = xbear.trim(document.getElementById(_this.DOM.login.id+'-ip').value);
        request.user = _this.REQUEST.form.user = xbear.trim(
          document.getElementById(_this.DOM.login.id + "-user").value
        );
        request.password = _this.REQUEST.form.password =
          document.getElementById(_this.DOM.login.id + "-password").value;
        request.remember = _this.REQUEST.form.remember =
          document.getElementById(_this.DOM.login.id + "-remember").checked;

        if (!!request.user) {
          //登录校验
          _this.DOM.login.element.style.display = "none";
          _this.loginRequest();
        } else {
          //发送请求，可以传参(提示类型)
          _this.printf("账号为空", 7);
          _this.logout();
        }
        return false;
      };

      // 注销
      _this.DOM.logout.element.onclick = function () {
        _this.logout();
      };
    }

    // 云台控制
    // 鼠标左键按下记录坐标
    xbear.addEvent(_this.DOM.controller.element, "mousedown", function () {
      // 已有鼠标事件在执行
      if (_this.VIDEO.mouseEvent.handler) return false;
      var event = event || window.event;
      _this.VIDEO.mouseEvent.x = event.clientX;
      _this.VIDEO.mouseEvent.y = event.clientY;
    });

    // 合并处理鼠标单击、双击事件
    xbear.addEvent(_this.DOM.controller.element, "mouseup", function () {
      // 每次点击均阻止事件冒泡到父元素(如列表的点击事件)
      // 每次点击重新计算最后鼠标坐标（timeout里执行）
      var event = event || window.event;
      if (window.event) {
        //IE
        event.cancelBubble = true;
      } else {
        //CHROME,SAFRI
        event.stopPropagation();
      }
      //_this.printf(_this.VIDEO.state,3,_this.VIDEO.mouseEvent.handler);
      // 当前事件不为点击事件时跳过处理(其它事件未处理完)
      if (
        _this.VIDEO.mouseEvent.handler &&
        _this.VIDEO.mouseEvent.handler !== "mouseup"
      )
        return false;
      // 仅执行一次点击事件
      if (_this.VIDEO.mouseEvent.handler === "mouseup") {
        _this.VIDEO.mouseEvent.times++;
        return false;
      }
      _this.VIDEO.mouseEvent.handler = "mouseup";
      _this.VIDEO.mouseEvent.times++;
      // 统一处理300ms内的鼠标点击事件
      _this.VIDEO.mouseEvent.timeout = setTimeout(function () {
        //_this.printf(_this.VIDEO.mouseEvent.times, 3, 'mouseup');
        if (_this.VIDEO.mouseEvent.times > 1) {
          //多次点击按双击事件处理(全屏)
          var wrap = _this.DOM.player.element.parentNode;
          if (xbear.isFullscreen()) {
            //退出全屏
            xbear.exitFullscreen();
          } else {
            xbear.fullscreen(wrap);
          }
          // 重置鼠标事件
          _this.resetMouseEvent();
        } else {
          //单击事件
          var multiple = 5; //位移放大倍数(位移*倍数=持续时间)
          var reference = 50; //位移基准参考点
          // 计算鼠标坐标位移
          _this.VIDEO.mouseEvent.x -= event.clientX;
          _this.VIDEO.mouseEvent.y -= event.clientY;
          // 如果坐标位移小于参考值,判定为点击事件
          if (
            Math.abs(_this.VIDEO.mouseEvent.x) < reference &&
            Math.abs(_this.VIDEO.mouseEvent.y) < reference
          ) {
            if (_this.VIDEO.state === "onplay") {
              //播放
              if (_this.VIDEO.player === "flash") {
                _this.VIDEO.state = "onpause";
                _this.DOM.controller.element.firstChild.className = "onpause";
                _this.DOM.player.element.style.display = "none";
              } else {
                _this.DOM.player.element.pause();
              }
            } else if (_this.VIDEO.state === "onpause") {
              //暂停
              if (_this.VIDEO.player === "flash") {
                _this.VIDEO.state = "onplay";
                _this.DOM.controller.element.firstChild.className = "onplay";
                _this.DOM.player.element.style.display = "block";
              } else {
                _this.DOM.player.element.play();
              }
            } else if (
              _this.VIDEO.state === "onload" &&
              _this.VIDEO.player !== "flash"
            ) {
              //加载中
              _this.DOM.player.element.load();
            }
            // 重置鼠标事件
            _this.resetMouseEvent();
          } else if (
            _this.CONFIG.controller &&
            _this.VIDEO.state === "onplay"
          ) {
            // 云台控制事件
            // 左右控制
            var dir =
              (_this.VIDEO.mouseEvent.x >= reference && "left") ||
              (Math.abs(_this.VIDEO.mouseEvent.x) >= reference && "right") ||
              "";
            var time =
              (dir && Math.abs(_this.VIDEO.mouseEvent.x) * multiple) || 0;
            if (time) {
              // 有左右控制云台操作
              _this.controlRequest(dir, time);
            }
            // 上下控制
            dir =
              (_this.VIDEO.mouseEvent.y >= reference && "up") ||
              (Math.abs(_this.VIDEO.mouseEvent.y) >= reference && "down") ||
              "";
            if (dir) {
              // 存在上下控制
              if (time) {
                // 如果有左右控制指令则等待
                setTimeout(function () {
                  _this.controlRequest(
                    dir,
                    Math.abs(_this.VIDEO.mouseEvent.y) * multiple
                  );
                }, time - reference);
              } else {
                _this.controlRequest(
                  dir,
                  Math.abs(_this.VIDEO.mouseEvent.y) * multiple
                );
              }
            }
            // 重置鼠标事件,由控制指令结束后释放
          } else {
            _this.printf("不支持云台控制", 3);
            // 重置鼠标事件
            _this.resetMouseEvent();
          }
        }
      }, 300);
    });

    // 鼠标滚动记录方向,并发送云台控制指令
    if (_this.CONFIG.controller) {
      xbear.addEvent(_this.DOM.controller.element, "mousewheel", function () {
        // 不在播放状态或当前事件不为滚动事件时跳过处理
        if (
          _this.VIDEO.state !== "onplay" ||
          (_this.VIDEO.mouseEvent.handler &&
            _this.VIDEO.mouseEvent.handler !== "mousewheel")
        )
          return false;
        // 仅执行一次滚动事件
        if (_this.VIDEO.mouseEvent.handler === "mousewheel") {
          _this.VIDEO.mouseEvent.times++;
          return false;
        }
        _this.VIDEO.mouseEvent.handler = "mousewheel";
        _this.VIDEO.mouseEvent.times++;
        var event = event || window.event;
        try {
          //禁止默认事件
          event.preventDefault(); // 兼容标准浏览器
        } catch (e) {
          window.event.returnValue = false; // 兼容IE6~8
        }
        var wheelDelta = event.wheelDelta || event.detail;
        // 禁止页面上下滚动
        document.documentElement.style.overflow = "hidden";
        // 300ms内的滚动事件统一处理
        _this.VIDEO.mouseEvent.timeout = setTimeout(function () {
          //_this.printf(_this.VIDEO.mouseEvent.times, 3, 'mousewheel times');
          if (wheelDelta > 0) {
            //变倍+
            _this.controlRequest("zoomin", _this.VIDEO.mouseEvent.times * 50);
          } else {
            //变倍-
            _this.controlRequest("zoomout", _this.VIDEO.mouseEvent.times * 50);
          }
          // 重置鼠标事件,由控制指令结束后释放
        }, 300);
      });
    }
  };

  // 重置鼠标事件
  HLS.prototype.resetMouseEvent = function () {
    this.printf("重置鼠标事件", 3);
    // 重置定时器
    clearTimeout(this.VIDEO.mouseEvent.timeout);
    // 重置鼠标滚动事件
    if (this.VIDEO.mouseEvent.handler === "mousewheel") {
      document.documentElement.style.overflow = "auto";
    }
    this.VIDEO.mouseEvent = {
      handler: null,
      times: 0,
      x: null,
      y: null,
      timeout: null,
    };
  };

  // 创建播放列表DOM
  HLS.prototype.createListDom = function (devList) {
    this.printf("创建播放列表", 3);
    var _this = this;
    if (!this.CONFIG.list) return;
    var html = "";
    for (var i = 0; i < devList.length; i++) {
      const state = devList[i].state;
      const stateName =
        devList[i].name || (MSG[state] && MSG[state].content) || "未知";
      const className = state ? "offline" : "online";
      html += `<li class="${this.DOM.list.className}-item" data-id="${i}">`;
      html += `<h3>${devList[i].name}</h3>`;
      html += `<div class="${this.DOM.wrap.className}" style="background-image:url(${devList[i].imgsrc})">`;
      html += `<i class="${className}">${stateName}</i></div></li>`;
    }
    // 生成列表
    this.DOM.list.element.innerHTML = html;
    // 显示列表
    this.DOM.list.element.style.display = "block";

    // 设置每行显示列数
    this.VIDEO.colNum =
      this.CONFIG.colNum ||
      Math.floor(this.DOM.element.clientWidth / this.CONFIG.colWidth) ||
      1;
    this.setColumn(this.DOM.list.element, this.VIDEO.colNum);
    if (!this.CONFIG.colNum) {
      //此时因引入了iframe会导致windows.length长度变为0，事件绑定到了iframe上面
      //需要扩展下事件监听不遍历
      xbear.addEvent(
        window,
        "resize",
        function () {
          var colNum =
            Math.floor(_this.DOM.element.clientWidth / _this.CONFIG.colWidth) ||
            1;
          if (_this.VIDEO.colNum !== colNum && !xbear.isFullscreen()) {
            _this.VIDEO.colNum = colNum;
            _this.setColumn(_this.DOM.list.element, _this.VIDEO.colNum);
            _this.movePlayer();
          }
        },
        false
      );
    }

    // 设置元素宽高比 wrap
    var wraps = this.DOM.list.element.getElementsByTagName("div");
    var ratio = this.CONFIG.ratio || 0.5625;
    for (var i = 0; i < wraps.length; i++) {
      this.setRatio(wraps[i], ratio);
    }

    //绑定播放列表点击事件,委托ul监听,为了防止点击播放事件冒泡,采用mouseup
    xbear.addEvent(this.DOM.list.element, "mouseup", function () {
      // 云台控制时禁止点击事件
      // if(_this.VIDEO.mouseEvent) return false;
      var event = event || window.event;
      var target = event.target || event.srcElement; // 发生事件的元素对象
      var nodeName = "";
      while (!!target) {
        //冒泡到需要执行的事件对象上
        nodeName = target.nodeName.toLowerCase();
        //_this.printf(nodeName);
        if (
          nodeName === "video" ||
          nodeName === "embed" ||
          nodeName === "object"
        ) {
          setTimeout(function () {
            //hls-plugin会连续播放暂停，需要延后判断
            if (nodeName === "video" && _this.VIDEO.state === "onpause") {
              _this.DOM.player.element.play();
            }
          }, 100);
          return false;
        }
        if (nodeName === "li" || nodeName === "ul") break;
        target = target.parentNode; //向上爬
      }

      if (nodeName === "li") {
        _this.VIDEO.request = devList[xbear.data(target, "id")];
        if (_this.VIDEO.request.sn === _this.VIDEO.playing.sn) {
          _this.printf("重复的播放请求", 3);
          return false;
        }
        if (!_this.VIDEO.request.hlsurl) {
          _this.stopPlay();
          const state = _this.VIDEO.request.state;
          const stateName =
            _this.VIDEO.request.state_name ||
            (MSG[state] && MSG[state].content) ||
            "设备不在线";
          _this.printf(stateName, 7);
          return false;
        }
        // 播放选择标记 //div
        _this.VIDEO.wrap = target.lastChild;
        // 停止当前播放
        _this.stopPlay();
        // 重新发送播放请求
        _this.printf(_this.VIDEO.request, 3, "播放请求");
        _this.callPlayer();
      }
    });
  };

  // 创建日志DOM
  HLS.prototype.createLogsDom = function () {
    if (!this.CONFIG.logs || this.DOM.logs.element) {
      return false;
    }
    //var html = '<textarea class="' + this.DOM.logs.className + '" id="' + this.DOM.logs.id + '"></textarea>';
    //this.DOM.element.innerHTML(html);
    var node = document.createElement("textarea");
    node.id = this.DOM.logs.id;
    node.className = this.DOM.logs.className;
    //this.DOM.element.appendChild(node);
    document.body.appendChild(node);
    this.DOM.logs.element = node;
    //增加默认文本节点
    var textNode = document.createTextNode(this.DOM.id + "\r\n");
    node.appendChild(textNode);
  };

  // 设置DOM高宽比
  HLS.prototype.setRatio = function (element, ratio) {
    // 按比例缩放
    if (ratio) {
      var percent = (ratio * 100).toString() + "%";
      element.style.paddingBottom = percent;
    }
    // 铺满上级容器
    else {
      element.style.height = "100%";
      element.style.paddingBottom = "0";
    }
  };

  // 设置每行显示几列子元素
  HLS.prototype.setColumn = function (element, colNum) {
    // 设置列类
    element.className = "video-box-list divided-" + colNum;
    // 计算每列宽度百分比
    var colWidth = (100 / colNum).toFixed(8) + "%";
    // 设置子元素列宽度
    for (var i = 0; i < element.childNodes.length; i++) {
      element.childNodes[i].style.width = colWidth;
    }
  };

  // 移动播放器及控制器,开始播放时及列表变动时
  HLS.prototype.movePlayer = function () {
    if (!this.VIDEO.state) return false;
    // 列表内播放：当前在列表外播放+当前列数小于或等于设定值
    if (this.VIDEO.wrap && this.VIDEO.colNum <= this.CONFIG.playinline) {
      this.printf("移动到列表内播放", 3);
      this.VIDEO.wrap.appendChild(this.DOM.player.element);
      this.VIDEO.wrap.appendChild(this.DOM.controller.element);
      this.DOM.controller.element.style.display = "block";
      //隐藏默认播放容器
      this.DOM.wrap.element.style.display = "none";
    } else {
      // 默认播放容器
      this.printf("移动到默认播放容器", 3);
      this.DOM.wrap.element.appendChild(this.DOM.player.element);
      this.DOM.wrap.element.appendChild(this.DOM.controller.element);
      this.DOM.controller.element.style.display = "block";
      //显示默认播放容器
      this.DOM.wrap.element.style.display = "block";
      // 修正播放容器高度异常
      if (!this.DOM.wrap.element.clientHeight) {
        this.setRatio(this.DOM.wrap.element, this.CONFIG.ratio || 0.5625);
      }
    }
  };

  // 设备SN对象转逗号分割字符串
  HLS.prototype.implodeDev = function (devObj) {
    var dev = new Array();
    var type =
      (typeof devObj === "object" && xbear.type(devObj)) || typeof devObj;
    //json字符串尝试先转换成数组或对象
    if (type === "string") {
      //console.log("string to object");
      try {
        devObj = JSON.parse(devObj);
        type = xbear.type(devObj);
      } catch (e) {}
    }
    if (type === "object") {
      //console.log("object to array");
      for (var key in devObj) {
        dev.push(devObj[key]);
      }
    } else if (type === "array") {
      //console.log("array to array");
      for (var i = 0; i < devObj.length; i++) {
        dev.push(devObj[i]["sn"]);
      }
    } else {
      //console.log("not object and array");
      return "";
    }
    return dev.join();
  };

  // 设备SN逗号分割字符串转对象
  HLS.prototype.explodeDev = function (devStr) {
    var devList = [];
    if (typeof devStr !== "string" || !devStr.length) return false;
    devStr = devStr.split(",");
    for (var i = 0; i < devStr.length; i++) {
      var obj = {};
      obj.sn = devStr[i];
      devList.push(obj);
    }
    return devList.length ? devList : false;
  };

  /**
   * @description 输出调试信息/日志/alert
   * @param {string|object} content 日志内容
   * @param {number} type 消息输出方式(1=控制台,2=日志容器,4=alert弹窗)
   * @param {string} prefix 前缀
   */
  HLS.prototype.printf = function (content, type, prefix) {
    type = type || 1;
    prefix = prefix || "";
    if (typeof content === "undefined") {
      //无内容或未指定日志类型时退出
      return false;
    }
    //将对象转换为文本,并清除多余"\"
    var str =
      typeof content === "object"
        ? JSON.stringify(content).replace(/\\/g, "")
        : content;
    //增加前缀
    str = prefix ? prefix + " : " + str : str;

    // 1 debbug + type in(1,3,5,7)
    if (
      this.CONFIG.debug &&
      (type == 1 || type == 3 || type == 5 || type == 7)
    ) {
      if (typeof content === "object") {
        console.log(this.DOM.id + " : " + prefix);
        console.log(content);
      } else {
        console.log(this.DOM.id + " : " + str);
      }
    }

    // 2 logs + type in(2,3,6,7)
    if (
      this.CONFIG.logs &&
      (type == 2 || type == 3 || type == 6 || type == 7)
    ) {
      if (!this.DOM.logs.element) {
        this.createLogsDom();
      }
      var textNode = document.createTextNode(str + "\r\n");
      var textArea = this.DOM.logs.element;
      //try { //文本区域开头增加内容
      //	textArea.insertBefore(textNode, textArea.childNodes[0]);
      //} catch(e) { //IE8下内容为空时insertBefore会抛出异常,可以先在结尾追加文本内容
      textArea.appendChild(textNode);
      //}
    }

    // 4 alert + type in(4,5,6,7)
    if (
      this.CONFIG.alert &&
      (type == 4 || type == 5 || type == 6 || type == 7)
    ) {
      alert(str);
    }
  };

  //暴露给外部调用
  window.HLS = HLS;
})();

// +----------------------------------------------------------------------
// | 消息提示配置,
// +----------------------------------------------------------------------
// | content = 消息内容
// | type    = 输出级别（1=控制台,2=前台日志,4=弹窗,可叠加）
// +----------------------------------------------------------------------
var MSG = {
  1: {
    content: "请求失败",
    type: 7,
  },
  9: {
    content: "用户不存在",
    type: 7,
  },
  10: {
    content: "用户已经在线",
    type: 7,
  },
  11: {
    content: "用户验证失败",
    type: 7,
  },
  50: {
    content: "离线",
    type: 7,
  },
  57: {
    content: "设备未验证",
    type: 7,
  },
  73: {
    content: "服务异常",
    type: 7,
  },
  77: {
    content: "未开放",
    type: 7,
  },
  1019: {
    content: "已关闭",
    type: 7,
  },
};

// +----------------------------------------------------------------------
// | 项目常用函数 20180822
// +----------------------------------------------------------------------
// | 无封装,不需要new,直接调用
// +----------------------------------------------------------------------
// | 作者: xbear <13632795588>
// +----------------------------------------------------------------------
// | 更新：
// |     20180822：增加全屏API的调用及判断
// |     20180822：处理addEvent,取消长度判断改为try，因为window对象在引入iframe后存在长度，造成绑定事件对象为iframe
// +----------------------------------------------------------------------
var xbear = {
  ver: "201808222250",
  js: {},
  css: {},
  dom: {},
  $id: function (id) {
    return document.getElementById(id);
  },
  data: function (element, obj) {
    if (!element) {
      return false;
    }
    if (typeof obj === "undefined") {
      var attrs = element.attributes;
      var data = {};
      for (var i = 0; i < attrs.length; i += 1) {
        var att = attrs[i].name.split("-");
        if (!!att[1] && att[0] === "data") {
          data[att[1]] = attrs[i].value;
        }
      }
      return data;
    } else if (typeof obj === "string" && obj) {
      return element.getAttribute("data-" + obj);
    } else if (typeof obj === "object") {
      for (var key in obj) {
        element.setAttribute("data-" + key, obj[key]);
      }
      return true;
    } else {
      return false;
    }
  },
  extend: function () {
    var length = arguments.length;
    var target = arguments[0] || {};
    if (typeof target !== "object" && typeof target !== "function") {
      target = {};
    }
    if (length == 1) {
      return target;
    }
    for (var i = 1; i < length; i += 1) {
      var source = arguments[i];
      for (var key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
          target[key] = source[key];
        }
      }
    }
    return target;
  },
  addEvent: function (el, type, fn) {
    if (document.addEventListener) {
      try {
        el.addEventListener(type, fn, false);
      } catch (e) {
        for (var i = 0; i < el.length; i += 1) {
          this.addEvent(el[i], type, fn);
        }
      }
    } else {
      try {
        el.attachEvent("on" + type, function () {
          return fn.call(el, window.event);
        });
      } catch (e) {
        for (var i = 0; i < el.length; i += 1) {
          this.addEvent(el[i], type, fn);
        }
      }
    }
  },
  get: function (url, fn) {
    this.ajax({
      url: url,
      success: fn,
    });
  },
  post: function (url, data, fn) {
    this.ajax({
      url: url,
      type: "POST",
      data: data,
      success: fn,
    });
  },
  ajax: function (options) {
    options = options || {};
    options.type = (options.type || "GET").toUpperCase();
    options.dataType = options.dataType || "json";
    var params = this.httpBuildQuery(options.data);
    var xhr;
    if (window.XMLHttpRequest) {
      xhr = new XMLHttpRequest();
    } else {
      xhr = ActiveXObject("Microsoft.XMLHTTP");
    }
    xhr.onload = xhr.onreadystatechange = function () {
      if (xhr.readyState == 4) {
        var status = xhr.status;
        if ((status >= 200 && status < 300) || status == 304) {
          options.success && options.success(xhr.responseText, xhr.responseXML);
        } else {
          options.error && options.error(status);
        }
        xhr.onload = xhr.onreadystatechange = null;
      }
    };
    if (options.type == "GET") {
      var url = params ? options.url + "?" + params : options.url;
      try {
        xhr.open("GET", url, true);
        xhr.send(null);
      } catch (e) {
        xhr.onload = xhr.onreadystatechange = null;
        this.jsonp(options);
      }
    } else if (options.type == "POST") {
      try {
        xhr.open("POST", options.url, true);
        xhr.setRequestHeader(
          "Content-Type",
          "application/x-www-form-urlencoded"
        );
        xhr.send(params);
      } catch (e) {
        xhr.onload = xhr.onreadystatechange = null;
        this.jsonp(options);
      }
    }
  },
  jsonp: function (options) {
    options = options || {};
    options.callback = options.callback || "callback";
    options.time = options.time || 5;
    if (!options.url) {
      throw new Error("参数不合法");
    }
    var _head = document.getElementsByTagName("head")[0];
    var _script = document.createElement("script");
    _head.appendChild(_script);
    var callbackName = ("jsonp_" + Math.random()).replace(".", "");
    if (options.time) {
      var destory = setTimeout(function () {
        window[callbackName] = null;
        _head.removeChild(_script);
        options.error && options.error("超时" + options.time + "秒");
      }, options.time * 1000);
    }
    window[callbackName] = function (data) {
      clearTimeout(destory);
      window[callbackName] = null;
      _head.removeChild(_script);
      options.success && options.success(data);
    };
    options.data[options.callback] = callbackName;
    var params = this.httpBuildQuery(options.data);
    _script.src = options.url + "?" + params;
  },
  httpBuildQuery: function (obj) {
    if (typeof obj !== "object") {
      try {
        obj = JSON.parse(obj);
      } catch (e) {
        obj = {};
      }
    }
    var arr = [];
    for (var key in obj) {
      arr.push(encodeURIComponent(key) + "=" + encodeURIComponent(obj[key]));
    }
    arr.push(("r=" + Math.random()).replace(".", ""));
    return arr.join("&");
  },
  type: function (obj) {
    var type = Object.prototype.toString.call(obj);
    if (type === "[object Array]") {
      return "array";
    } else if (type === "[object Object]") {
      return "object";
    } else if (type === "[object String]") {
      return "string";
    } else if (type === "[object Number]") {
      return "number";
    } else if (type === "[object Boolean]") {
      return "boolean";
    } else if (type === "[object Function]") {
      return "function";
    } else {
      return "undefined";
    }
  },
  urlParms: function () {
    var args = {};
    var query = window.location.search.substring(1);
    var pairs = query.split("&");
    for (var i = 0; i < pairs.length; i += 1) {
      var pos = pairs[i].indexOf("=");
      if (pos == -1) {
        continue;
      }
      var argname = pairs[i].substring(0, pos);
      var value = pairs[i].substring(pos + 1);
      args[argname] = unescape(value);
    }
    return args;
  },
  urlParm: function (name, url) {
    var reg = new RegExp("(^|\\?|&)" + name + "=([^&]*)(&|$)");
    var url = url || window.location.search.substr(1);
    var r = url.match(reg);
    if (r != null) {
      return unescape(r[2]);
    }
    return null;
  },
  utf8: {
    encode: function (str) {
      var c = String.fromCharCode(0);
      var strUtf = str
        .replace(/[\u0080-\u07ff]/g, function (c) {
          var cc = c.charCodeAt(0);
          return String.fromCharCode(0xc0 | (cc >> 6), 0x80 | (cc & 0x3f));
        })
        .replace(/[\u0800-\uffff]/g, function (c) {
          var cc = c.charCodeAt(0);
          return String.fromCharCode(
            0xe0 | (cc >> 12),
            0x80 | ((cc >> 6) & 0x3f),
            0x80 | (cc & 0x3f)
          );
        });
      return strUtf;
    },
    decode: function (str) {
      var c = String.fromCharCode(0);
      var strUni = str
        .replace(
          /[\u00e0-\u00ef][\u0080-\u00bf][\u0080-\u00bf]/g,
          function (c) {
            var cc =
              ((c.charCodeAt(0) & 0x0f) << 12) |
              ((c.charCodeAt(1) & 0x3f) << 6) |
              (c.charCodeAt(2) & 0x3f);
            return String.fromCharCode(cc);
          }
        )
        .replace(/[\u00c0-\u00df][\u0080-\u00bf]/g, function (c) {
          var cc = ((c.charCodeAt(0) & 0x1f) << 6) | (c.charCodeAt(1) & 0x3f);
          return String.fromCharCode(cc);
        });
      return strUni;
    },
  },
  base64: {
    b64: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",
    a256: "",
    r64: [256],
    r256: [256],
    init: function () {
      var i = 0;
      while (i < 256) {
        var c = String.fromCharCode(i);
        this.a256 += c;
        this.r256[i] = i;
        this.r64[i] = this.b64.indexOf(c);
        i += 1;
      }
    },
    code: function (s, discard, alpha, beta, w1, w2) {
      s = String(s);
      var buffer = 0,
        i = 0,
        length = s.length,
        result = "",
        bitsInBuffer = 0;
      while (i < length) {
        var c = s.charCodeAt(i);
        c = c < 256 ? alpha[c] : -1;
        buffer = (buffer << w1) + c;
        bitsInBuffer += w1;
        while (bitsInBuffer >= w2) {
          bitsInBuffer -= w2;
          var tmp = buffer >> bitsInBuffer;
          result += beta.charAt(tmp);
          buffer ^= tmp << bitsInBuffer;
        }
        i += 1;
      }
      if (!discard && bitsInBuffer > 0) {
        result += beta.charAt(buffer << (w2 - bitsInBuffer));
      }
      return result;
    },
    encode: function (str, utf8bool) {
      utf8bool = typeof utf8bool === "undefined" ? true : utf8bool;
      this.init();
      str = utf8bool ? xbear.utf8.encode(str) : str;
      str = this.code(str, false, this.r256, this.b64, 8, 6);
      return str + "====".slice(str.length % 4 || 4);
    },
    decode: function (str, utf8bool) {
      utf8bool = typeof utf8bool === "undefined" ? true : utf8bool;
      str = String(str).split("=");
      this.init();
      var i = str.length;
      do {
        i -= 1;
        str[i] = this.code(str[i], true, this.r64, this.a256, 6, 8);
      } while (i > 0);
      str = str.join("");
      return utf8bool ? xbear.utf8.decode(str) : str;
    },
    encode2: function (str) {
      var b64str = this.encode(str);
      var num = Math.ceil(Math.random() * b64str.length) || 1;
      if (num % 2 == 0) {
        num = num - 1;
      }
      var str1 = b64str.slice(0, num);
      var str2 = b64str.slice(num);
      b64str = str2 + str1 + "-" + num.toString(16);
      return b64str;
    },
    decode2: function (b64str) {
      var arr = b64str.split("-");
      var num = -1 * parseInt(arr[1], 16);
      return this.decode(arr[0].slice(num) + arr[0].slice(0, num));
    },
  },
  md5: function (str) {
    var rotateLeft = function (lValue, iShiftBits) {
      return (lValue << iShiftBits) | (lValue >>> (32 - iShiftBits));
    };
    var addUnsigned = function (lX, lY) {
      var lX4, lY4, lX8, lY8, lResult;
      lX8 = lX & 0x80000000;
      lY8 = lY & 0x80000000;
      lX4 = lX & 0x40000000;
      lY4 = lY & 0x40000000;
      lResult = (lX & 0x3fffffff) + (lY & 0x3fffffff);
      if (lX4 & lY4) {
        return lResult ^ 0x80000000 ^ lX8 ^ lY8;
      }
      if (lX4 | lY4) {
        if (lResult & 0x40000000) {
          return lResult ^ 0xc0000000 ^ lX8 ^ lY8;
        } else {
          return lResult ^ 0x40000000 ^ lX8 ^ lY8;
        }
      } else {
        return lResult ^ lX8 ^ lY8;
      }
    };
    var F = function (x, y, z) {
      return (x & y) | (~x & z);
    };
    var G = function (x, y, z) {
      return (x & z) | (y & ~z);
    };
    var H = function (x, y, z) {
      return x ^ y ^ z;
    };
    var I = function (x, y, z) {
      return y ^ (x | ~z);
    };
    var FF = function (a, b, c, d, x, s, ac) {
      a = addUnsigned(a, addUnsigned(addUnsigned(F(b, c, d), x), ac));
      return addUnsigned(rotateLeft(a, s), b);
    };
    var GG = function (a, b, c, d, x, s, ac) {
      a = addUnsigned(a, addUnsigned(addUnsigned(G(b, c, d), x), ac));
      return addUnsigned(rotateLeft(a, s), b);
    };
    var HH = function (a, b, c, d, x, s, ac) {
      a = addUnsigned(a, addUnsigned(addUnsigned(H(b, c, d), x), ac));
      return addUnsigned(rotateLeft(a, s), b);
    };
    var II = function (a, b, c, d, x, s, ac) {
      a = addUnsigned(a, addUnsigned(addUnsigned(I(b, c, d), x), ac));
      return addUnsigned(rotateLeft(a, s), b);
    };
    var convertToWordArray = function (string) {
      var lWordCount;
      var lMessageLength = string.length;
      var lNumberOfWordsTempOne = lMessageLength + 8;
      var lNumberOfWordsTempTwo =
        (lNumberOfWordsTempOne - (lNumberOfWordsTempOne % 64)) / 64;
      var lNumberOfWords = (lNumberOfWordsTempTwo + 1) * 16;
      var lWordArray = Array(lNumberOfWords - 1);
      var lBytePosition = 0;
      var lByteCount = 0;
      while (lByteCount < lMessageLength) {
        lWordCount = (lByteCount - (lByteCount % 4)) / 4;
        lBytePosition = (lByteCount % 4) * 8;
        lWordArray[lWordCount] =
          lWordArray[lWordCount] |
          (string.charCodeAt(lByteCount) << lBytePosition);
        lByteCount += 1;
      }
      lWordCount = (lByteCount - (lByteCount % 4)) / 4;
      lBytePosition = (lByteCount % 4) * 8;
      lWordArray[lWordCount] = lWordArray[lWordCount] | (0x80 << lBytePosition);
      lWordArray[lNumberOfWords - 2] = lMessageLength << 3;
      lWordArray[lNumberOfWords - 1] = lMessageLength >>> 29;
      return lWordArray;
    };
    var wordToHex = function (lValue) {
      var WordToHexValue = "",
        WordToHexValueTemp = "",
        lByte,
        lCount;
      for (lCount = 0; lCount <= 3; lCount += 1) {
        lByte = (lValue >>> (lCount * 8)) & 255;
        WordToHexValueTemp = "0" + lByte.toString(16);
        WordToHexValue =
          WordToHexValue +
          WordToHexValueTemp.substr(WordToHexValueTemp.length - 2, 2);
      }
      return WordToHexValue;
    };
    var uTF8Encode = function (string) {
      string = string.replace(/\x0d\x0a/g, "\x0a");
      var output = "";
      for (var n = 0; n < string.length; n += 1) {
        var c = string.charCodeAt(n);
        if (c < 128) {
          output += String.fromCharCode(c);
        } else if (c > 127 && c < 2048) {
          output += String.fromCharCode((c >> 6) | 192);
          output += String.fromCharCode((c & 63) | 128);
        } else {
          output += String.fromCharCode((c >> 12) | 224);
          output += String.fromCharCode(((c >> 6) & 63) | 128);
          output += String.fromCharCode((c & 63) | 128);
        }
      }
      return output;
    };
    var md5 = function (string) {
      var x = Array();
      var k, AA, BB, CC, DD, a, b, c, d;
      var S11 = 7,
        S12 = 12,
        S13 = 17,
        S14 = 22;
      var S21 = 5,
        S22 = 9,
        S23 = 14,
        S24 = 20;
      var S31 = 4,
        S32 = 11,
        S33 = 16,
        S34 = 23;
      var S41 = 6,
        S42 = 10,
        S43 = 15,
        S44 = 21;
      string = uTF8Encode(string);
      x = convertToWordArray(string);
      a = 0x67452301;
      b = 0xefcdab89;
      c = 0x98badcfe;
      d = 0x10325476;
      for (k = 0; k < x.length; k += 16) {
        AA = a;
        BB = b;
        CC = c;
        DD = d;
        a = FF(a, b, c, d, x[k + 0], S11, 0xd76aa478);
        d = FF(d, a, b, c, x[k + 1], S12, 0xe8c7b756);
        c = FF(c, d, a, b, x[k + 2], S13, 0x242070db);
        b = FF(b, c, d, a, x[k + 3], S14, 0xc1bdceee);
        a = FF(a, b, c, d, x[k + 4], S11, 0xf57c0faf);
        d = FF(d, a, b, c, x[k + 5], S12, 0x4787c62a);
        c = FF(c, d, a, b, x[k + 6], S13, 0xa8304613);
        b = FF(b, c, d, a, x[k + 7], S14, 0xfd469501);
        a = FF(a, b, c, d, x[k + 8], S11, 0x698098d8);
        d = FF(d, a, b, c, x[k + 9], S12, 0x8b44f7af);
        c = FF(c, d, a, b, x[k + 10], S13, 0xffff5bb1);
        b = FF(b, c, d, a, x[k + 11], S14, 0x895cd7be);
        a = FF(a, b, c, d, x[k + 12], S11, 0x6b901122);
        d = FF(d, a, b, c, x[k + 13], S12, 0xfd987193);
        c = FF(c, d, a, b, x[k + 14], S13, 0xa679438e);
        b = FF(b, c, d, a, x[k + 15], S14, 0x49b40821);
        a = GG(a, b, c, d, x[k + 1], S21, 0xf61e2562);
        d = GG(d, a, b, c, x[k + 6], S22, 0xc040b340);
        c = GG(c, d, a, b, x[k + 11], S23, 0x265e5a51);
        b = GG(b, c, d, a, x[k + 0], S24, 0xe9b6c7aa);
        a = GG(a, b, c, d, x[k + 5], S21, 0xd62f105d);
        d = GG(d, a, b, c, x[k + 10], S22, 0x2441453);
        c = GG(c, d, a, b, x[k + 15], S23, 0xd8a1e681);
        b = GG(b, c, d, a, x[k + 4], S24, 0xe7d3fbc8);
        a = GG(a, b, c, d, x[k + 9], S21, 0x21e1cde6);
        d = GG(d, a, b, c, x[k + 14], S22, 0xc33707d6);
        c = GG(c, d, a, b, x[k + 3], S23, 0xf4d50d87);
        b = GG(b, c, d, a, x[k + 8], S24, 0x455a14ed);
        a = GG(a, b, c, d, x[k + 13], S21, 0xa9e3e905);
        d = GG(d, a, b, c, x[k + 2], S22, 0xfcefa3f8);
        c = GG(c, d, a, b, x[k + 7], S23, 0x676f02d9);
        b = GG(b, c, d, a, x[k + 12], S24, 0x8d2a4c8a);
        a = HH(a, b, c, d, x[k + 5], S31, 0xfffa3942);
        d = HH(d, a, b, c, x[k + 8], S32, 0x8771f681);
        c = HH(c, d, a, b, x[k + 11], S33, 0x6d9d6122);
        b = HH(b, c, d, a, x[k + 14], S34, 0xfde5380c);
        a = HH(a, b, c, d, x[k + 1], S31, 0xa4beea44);
        d = HH(d, a, b, c, x[k + 4], S32, 0x4bdecfa9);
        c = HH(c, d, a, b, x[k + 7], S33, 0xf6bb4b60);
        b = HH(b, c, d, a, x[k + 10], S34, 0xbebfbc70);
        a = HH(a, b, c, d, x[k + 13], S31, 0x289b7ec6);
        d = HH(d, a, b, c, x[k + 0], S32, 0xeaa127fa);
        c = HH(c, d, a, b, x[k + 3], S33, 0xd4ef3085);
        b = HH(b, c, d, a, x[k + 6], S34, 0x4881d05);
        a = HH(a, b, c, d, x[k + 9], S31, 0xd9d4d039);
        d = HH(d, a, b, c, x[k + 12], S32, 0xe6db99e5);
        c = HH(c, d, a, b, x[k + 15], S33, 0x1fa27cf8);
        b = HH(b, c, d, a, x[k + 2], S34, 0xc4ac5665);
        a = II(a, b, c, d, x[k + 0], S41, 0xf4292244);
        d = II(d, a, b, c, x[k + 7], S42, 0x432aff97);
        c = II(c, d, a, b, x[k + 14], S43, 0xab9423a7);
        b = II(b, c, d, a, x[k + 5], S44, 0xfc93a039);
        a = II(a, b, c, d, x[k + 12], S41, 0x655b59c3);
        d = II(d, a, b, c, x[k + 3], S42, 0x8f0ccc92);
        c = II(c, d, a, b, x[k + 10], S43, 0xffeff47d);
        b = II(b, c, d, a, x[k + 1], S44, 0x85845dd1);
        a = II(a, b, c, d, x[k + 8], S41, 0x6fa87e4f);
        d = II(d, a, b, c, x[k + 15], S42, 0xfe2ce6e0);
        c = II(c, d, a, b, x[k + 6], S43, 0xa3014314);
        b = II(b, c, d, a, x[k + 13], S44, 0x4e0811a1);
        a = II(a, b, c, d, x[k + 4], S41, 0xf7537e82);
        d = II(d, a, b, c, x[k + 11], S42, 0xbd3af235);
        c = II(c, d, a, b, x[k + 2], S43, 0x2ad7d2bb);
        b = II(b, c, d, a, x[k + 9], S44, 0xeb86d391);
        a = addUnsigned(a, AA);
        b = addUnsigned(b, BB);
        c = addUnsigned(c, CC);
        d = addUnsigned(d, DD);
      }
      var tempValue = wordToHex(a) + wordToHex(b) + wordToHex(c) + wordToHex(d);
      return tempValue.toLowerCase();
    };
    return md5(str);
  },
  trim: function (str) {
    return str.replace(/^\s+|\s+$/gm, "");
  },
  loadJs: function (path, fn) {
    var id = this.md5(path);
    var script = document.getElementById(id);
    var src = path + "?ver=" + this.ver;
    if (!script) {
      var head = document.getElementsByTagName("head")[0];
      script = document.createElement("script");
      script.type = "text/javascript";
      script.src = src;
      script.id = id;
      head.appendChild(script);
    } else if (xbear.urlParm("ver", script.src) !== this.ver) {
      script.src = src;
    } else {
      script.onload = script.onreadystatechange = null;
      if (typeof fn === "function") {
        fn.call(this);
      }
      return true;
    }
    script.onload = script.onreadystatechange = function () {
      if (
        !this.readyState ||
        this.readyState === "loaded" ||
        this.readyState === "complete"
      ) {
        xbear.js[id] = script.src;
        if (typeof fn === "function") {
          fn.call(this);
        }
        script.onload = script.onreadystatechange = null;
      }
    };
  },
  fullscreen: function (element) {
    if (element.requestFullScreen) {
      element.requestFullScreen();
    } else if (element.mozRequestFullScreen) {
      element.mozRequestFullScreen();
    } else if (element.msRequestFullscreen) {
      element.msRequestFullscreen();
    } else if (element.webkitRequestFullscreen) {
      element.webkitRequestFullScreen();
    } else {
      return false;
    }
  },
  exitFullscreen: function () {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    } else if (document.mozCancelFullScreen) {
      document.mozCancelFullScreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
  },
  isFullscreen: function () {
    return (
      !!document.fullscreenElement ||
      !!document.msFullscreenElement ||
      !!document.mozFullScreenElement ||
      !!document.webkitFullscreenElement ||
      false
    );
  },
};

// +----------------------------------------------------------------------
// | 兼容处理
// +----------------------------------------------------------------------
// | 解决IE下一些异常,console未定义
// +----------------------------------------------------------------------
// | 1 console未定义,重新定义console
// | 2 对象如果后面有删除会提示对象未定义,在调用前可以用IF判断下，后面再重新添加
// | 3 IE6，7，8  JSON 未定义,用户自行下载JSON2.js引入，
// |   https://github.com/douglascrockford/JSON-js
// +----------------------------------------------------------------------
// | 作者: xbear <13632795588>
// +----------------------------------------------------------------------
//window.console = window.console || (function() {
//	var c = {};
//	c.log = c.warn = c.debug = c.info = c.error = c.time = c.dir = c.profile = c.clear = c.exception = c.trace = c.assert = function() {};
//	return c
//})();
