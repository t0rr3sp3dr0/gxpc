// helper function that will create new NativeFunction
function getFunc(name, ret_type, args) {
    return new NativeFunction(Module.findExportByName(null, name), ret_type, args);
}

// get value type name from xpc_object_t
function getValueTypeName(val) {
    var valueType = xpc_get_type(val);
    var name = xpc_type_get_name(valueType);
    return Memory.readCString(name);
}

var xpc_connection_send_notification = Module.findExportByName(null, "xpc_connection_send_notification");
var xpc_connection_send_message = Module.findExportByName(null, "xpc_connection_send_message");
var xpc_connection_send_message_with_reply = Module.findExportByName(null, "xpc_connection_send_message_with_reply");
var xpc_connection_send_message_with_reply_sync = Module.findExportByName(null, "xpc_connection_send_message_with_reply_sync");
var xpc_connection_create_mach_service = Module.findExportByName(null, "xpc_connection_create_mach_service");

var xpc_connection_get_name = getFunc("xpc_connection_get_name", "pointer", ["pointer"]);
var xpc_get_type = getFunc("xpc_get_type", "pointer", ["pointer"]);
var xpc_type_get_name = getFunc("xpc_type_get_name", "pointer", ["pointer"]);
var xpc_dictionary_get_value = getFunc("xpc_dictionary_get_value", "pointer", ["pointer", "pointer"]);
var xpc_dictionary_get_data = getFunc("xpc_dictionary_get_data", "pointer", ["pointer", "pointer", "pointer"]);
var xpc_string_get_string_ptr = getFunc("xpc_string_get_string_ptr", "pointer", ["pointer"]);
var xpc_data_get_bytes = getFunc("xpc_data_get_bytes", "int", ["pointer", "pointer", "int", "int"]);
var xpc_copy_description = getFunc("xpc_copy_description", "pointer", ["pointer"]);
var xpc_get_type = getFunc("xpc_get_type", "pointer", ["pointer"]);
var xpc_type_get_name = getFunc("xpc_type_get_name", "pointer", ["pointer"]);

var xpc_uint64_get_value = getFunc("xpc_uint64_get_value", "int", ["pointer"]);
var xpc_int64_get_value = getFunc("xpc_int64_get_value", "int", ["pointer"]);
var xpc_double_get_value = getFunc("xpc_double_get_value", "double", ["pointer"]);
var xpc_bool_get_value = getFunc("xpc_bool_get_value", "bool", ["pointer"]);
var xpc_uuid_get_bytes = getFunc("xpc_uuid_get_bytes", "pointer", ["pointer"]);

// dictionary functions
var xpc_dictionary_set_string = Module.findExportByName(null, "xpc_dictionary_set_string");

const p___CFBinaryPlistCreate15 = DebugSymbol.fromName('__CFBinaryPlistCreate15').address;
const p__xpc_Connection_call_event_handler = DebugSymbol.fromName("_xpc_connection_call_event_handler").address;
let call_event_handler = new NativeFunction(p__xpc_Connection_call_event_handler, "void", ["pointer", "pointer"]);
let plist15Create = new NativeFunction(p___CFBinaryPlistCreate15, "pointer", ["pointer", "int", "pointer"]);

// create C string from JavaScript string
function cstr(str) {
    return Memory.allocUtf8String(str);
}

// get JavaScript string from C string
function rcstr(cstr) {
    return Memory.readCString(cstr);
}

// get C string from XPC string
function getXPCString(val) {
    var content = xpc_string_get_string_ptr(val);
    return rcstr(content)
}

function getXPCData(conn, dict, val, key) {
    var ll = Memory.alloc(Process.pointerSize);
    xpc_dictionary_get_data(dict, key, ll);
    var buff = Memory.alloc(Process.pointerSize * Memory.readInt(ll));
    var n = xpc_data_get_bytes(val, buff, 0, Memory.readInt(ll));
    if (n != Memory.readInt(ll)) {
        return null;
    } else {
        const hdr = buff.readCString(8);
        if (hdr == "bplist15") {
            const plist = plist15Create(buff, n, ptr("0x0"));
            return ObjC.Object(plist).description().toString();
        } else if (hdr == "bplist17") {
            return parseBPList17(conn, dict);
        } else if (hdr == "bplist00") {
            const format = Memory.alloc(8);
            format.writeU64(0xaaaaaaaa);
            var ObjCData = ObjC.classes.NSData.dataWithBytes_length_(buff, n);
            const plist = ObjC.classes.NSPropertyListSerialization.propertyListWithData_options_format_error_(ObjCData, 0, format, ptr(0x0));
            return ObjC.Object(plist).description().toString();
        } else {
            var ObjCData = ObjC.classes.NSData.dataWithBytes_length_(buff, n);
            var base64Encoded = ObjCData.base64EncodedStringWithOptions_(0).toString();
            return base64Encoded;
        }
    }
}

function getKeys(description) {
    const rex = /(.*?)"\s=>\s/g;
    let matches = (description.match(rex) || []).map(e => e.replace(rex, '$1'));
    var realMatches = [];
    var first = true;
    var depth = 0;
    for (var i in matches) {
        if (first) {
            depth = (matches[i].match(/\t/g) || []).length;
            first = false;
        }
        var elemDepth = (matches[i].match(/\t/g) || []).length;
        if (elemDepth == depth) {
            realMatches.push(matches[i].slice(2));
        }
    }
    return realMatches;
}

// https://github.com/nst/iOS-Runtime-Headers/blob/master/Frameworks/Foundation.framework/NSXPCDecoder.h
function parseBPList17(conn, dict) {
    var decoder = ObjC.classes.NSXPCDecoder.alloc().init();
    decoder["- set_connection:"](conn);
    decoder["- _startReadingFromXPCObject:"](dict);
    return decoder.debugDescription().toString();
}

function extract(conn, xpc_object, ret) {
    var xpc_object_type = getValueTypeName(xpc_object);
    switch (xpc_object_type) {
        case "dictionary":
            var keys = getKeys(rcstr(xpc_copy_description(xpc_object)));
            for (var i in keys) {
                var type = getValueTypeName(xpc_dictionary_get_value(xpc_object, cstr(keys[i])));
                var val = xpc_dictionary_get_value(xpc_object, cstr(keys[i]));
                switch (type) {
                    case "string":
                        ret[keys[i]] = getXPCString(val);
                        break;
                    case "data":
                        var key = cstr(keys[i]);
                        ret[keys[i]] = getXPCData(conn, xpc_object, val, key);
                        break;
                    case "uint64":
                        ret[keys[i]] = xpc_uint64_get_value(val);
                        break;
                    case "int64":
                        ret[keys[i]] = xpc_int64_get_value(val);
                        break;
                    case "dictionary":
                        var out = {};
                        extract(conn, val, out);
                        ret[keys[i]] = out;
                        break;
                    case "double":
                        ret[keys[i]] = xpc_double_get_value(val);
                        break;
                    case "bool":
                        ret[keys[i]] = xpc_bool_get_value(val);
                        break;
                    case "uuid":
                        ret[keys[i]] = xpc_uuid_get_bytes(val);
                        break;
                    default:
                        ret[keys[i]] = "not known yet for" + type;
                }
            }
            break;
        default:
            return;
    }
    return ret;
}

function parseAndSendDictData(fnName, conn, dict) {
    var ret = {};
    ret["name"] = fnName;
    var connName = xpc_connection_get_name(conn);
    if (connName == 0x0) {
        ret["connName"] = "UNKNOWN"
    } else {
        ret["connName"] = rcstr(connName);
    }
    var dictData = {};
    extract(conn, dict, dictData);
    ret["dictionary"] = dictData;
    send(JSON.stringify(ret));
    //send(JSON.stringify(extract(dict)));
}

var interceptors = {
    "xpc_connection_send_notification": xpc_connection_send_notification,
    "xpc_connection_send_message": xpc_connection_send_message,
    "xpc_connection_send_message_with_reply": xpc_connection_send_message_with_reply,
    "xpc_connection_send_message_with_reply_sync": xpc_connection_send_message_with_reply_sync,
    "xpc_connection_call_event_handler": call_event_handler
}

for (var name in interceptors) {
    Interceptor.attach(interceptors[name], {
        onEnter(args) {
            var conn = args[0];
            var dict = args[1];
            parseAndSendDictData(name, conn, dict);
        }
    });
}

Interceptor.attach(xpc_connection_create_mach_service, {
    onEnter(args) {
        var ret = {};
        ret["connName"] = rcstr(args[0]);
        ret["name"] = "xpc_connection_create_mach_service";
        ret["dictionary"] = {
            "Service name": rcstr(args[0])
        };
        send(JSON.stringify(ret));
    },
})

Interceptor.attach(xpc_dictionary_set_string, {
    onEnter(args) {
        var ret = {};
        ret["connName"] = "DICT CREATION";
        ret["name"] = "xpc_dictionary_set_string";
        ret["dictionary"] = {
            "key": rcstr(args[1]),
            "value": rcstr(args[2])
        };
        send(JSON.stringify(ret));
    }
});
