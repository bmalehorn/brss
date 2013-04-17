export var throwIt = function(err : any) : void {
  if (err)
    throw err;
};

export var logIt = function(err : any) : void {
  if (err)
    console.log(err);
};

export var sify = function(obj : any) : string {
  return JSON.stringify(obj, null, "\t");
};

/* Pretty-print this object */
export var pp = function(obj, name ?: string) {
  if (name)
    console.log(name + " = " + sify(obj));
  else
    console.log(sify(obj));
};

export var assert = function(cond : bool, msg ?: string) : void {
  if (!msg) {
    msg = "assertion error";
  }
  if (!cond) {
    throw msg;
  }
};

export var pass = function(...args : any[]) : any {
};

export var httpize = function(url : string) : string {
  if (url.indexOf("http://") !== 0 && url.indexOf("https://") !== 0) {
    url = "http://" + url;
  }
  // replace "//" with "/"
  url = url.replace(/\/\//g, "/");
  url = url.replace("http:/", "http://");
  url = url.replace("https:/", "https://");
  return url;
};
