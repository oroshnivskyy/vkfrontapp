"use strict";

function interval(func, wait, times) {
    var interv = function (w, t) {
        return function () {
            if (typeof t === "undefined" || t-- > 0) {
                try {
                    var res = func.call(null);
                    if (typeof res.then === 'function') {
                        res.then(function () {
                            setTimeout(interv, w);
                        }).catch(function () {
                            setTimeout(interv, w);
                        })
                    } else {
                        setTimeout(interv, w);
                    }
                }
                catch (e) {
                    t = 0;
                    setTimeout(interv, w);
                    throw e.toString();
                }
            }
        };
    }(wait, times);

    setTimeout(interv, wait);
}
module.exports = interval;