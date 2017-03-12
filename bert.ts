Number.isInteger = Number.isInteger || function(value) {
  return typeof value === 'number'
         && Number.isFinite(value)
         && !(value % 1);
};
function tuple() {
    return {_: Array.prototype.slice.call(arguments)};
}
module Bert {
    export function encode(obj: any) {
        let writer = new Stream.Writer();
        writer.writeUint8(131);
        doEncode(obj, writer);
        return writer.getData();
    }
    function doEncode(obj: any, writer: Stream.Writer) {
        if ('string' === typeof obj) {
            if (':' === obj[0]) {
                encodeAtom(obj.slice(1), writer);
            }
            else if ('.' === obj[0]) {
                encodeBinaryString(obj.slice(1), writer);
            }
            else if ('$' === obj[0]) {
                encodeListString(obj.slice(1), writer);
            }
            else {
                encodeAtom(obj, writer);
            }
        } else if ('object' === typeof obj) {
            if (obj instanceof Array) {
                encodeList(obj, writer);
            }
            else {
                if (obj.hasOwnProperty('_')) {
                    encodeTuple(obj._, writer);
                }
                else {
                    encodeMap(obj, writer);
                }
            }
        }
        else if (!isNaN(obj)) {
            encodeNumber(obj, writer);
        }
    }
    function encodeAtom(s: string, writer: Stream.Writer) {
        let atom = Utf8.encode(s);
        let tag: number;
        if (atom.byteLength < 256) {
            if (atom.byteLength === s.length) tag = 115;
            else tag = 119;
            writer.writeUint8(tag);
            writer.writeUint8(atom.byteLength);
        }
        else {
            if (atom.byteLength === s.length) tag = 100;
            else tag = 118;
            writer.writeUint8(tag);
            writer.writeUint16(atom.byteLength);
        }
        writer.writeVector(atom);
    }
    function encodeBinaryString(s: string, writer: Stream.Writer) {
        let str = Utf8.encode(s);
        writer.writeUint8(109);
        writer.writeUint32(str.byteLength);
        writer.writeVector(str);
    }
    function encodeListString(s: string, writer: Stream.Writer) {
        let str = Utf8.encode(s);
        writer.writeUint8(107);
        writer.writeUint16(str.byteLength);
        writer.writeVector(str);
    }
    function encodeList(list: any[], writer: Stream.Writer) {
        if (list.length > 0) {
            writer.writeUint8(108);
            writer.writeUint32(list.length);
            let i;
            for (i = 0; i < list.length; i++) {
                doEncode(list[i], writer);
            }
        }
        writer.writeUint8(106);
    }
    function encodeTuple(elements: any[], writer: Stream.Writer) {
        if (elements.length < 256) {
            writer.writeUint8(104);
            writer.writeUint8(elements.length);
        }
        else {
            writer.writeUint8(105);
            writer.writeUint32(elements.length);
        }
        let i;
        for (i = 0; i < elements.length; i++) {
            doEncode(elements[i], writer);
        }
    }
    function encodeMap(obj: object, writer: Stream.Writer) {
        writer.writeUint8(116);
        let keys = Object.keys(obj);
        writer.writeUint32(keys.length);
        let i;
        for (i = 0; i < keys.length; i++) {
            doEncode(keys[i], writer);
            doEncode(obj[keys[i]], writer);
        }
    }
    function encodeNumber(n: number, writer: Stream.Writer) {
        if (Number.isInteger(n)) {
            let ab = new ArrayBuffer(4);
            let dv = new DataView(ab);
            dv.setInt32(0, n);
            if (dv.getInt8(3) === n) {
                writer.writeUint8(97);
                writer.writeUint8(n);
            }
            else if (dv.getInt32(0) === n) {
                writer.writeUint8(98);
                writer.writeUint32(n);
            }
            else {
                let digits: number[] = [];
                let base = 256;
                let sign = n >= 0 ? 0 : 1;
                let quot = Math.abs(n);
                while (quot != 0) {
                    let rem = quot % base;
                    quot = Math.floor(quot / base);
                    digits.push(rem);
                }
                if (digits.length < 256) {
                    writer.writeUint8(110);
                    writer.writeUint8(digits.length);
                }
                else {
                    writer.writeUint8(111);
                    writer.writeUint32(digits.length);
                }
                writer.writeUint8(sign);
                writer.writeVector(digits);
            }
        }
        else {
            writer.writeFloat64(n);
        }
    }
    export function decode(data: object): any {
        let reader = new Stream.Reader(data);
        let tag = reader.uint8();
        if (131 === tag) {
            return doDecode(reader);
        }
        throw 'Invalid binary';
    }
    function doDecode(reader: Stream.Reader): any {
        let tag = reader.uint8();
        switch (tag) {
            case 70: return reader.float64();
            case 97: return reader.int8();
            case 98: return reader.int32();
            case 99: return 0; // old float
            case 100: return ':' + decodeString(reader.uint16(), reader);
            case 104: return decodeTuple(reader.uint8(), reader);
            case 105: return decodeTuple(reader.uint32(), reader);
            case 106: return [];
            case 107: return '$' + decodeString(reader.uint16(), reader);
            case 108: return decodeList(reader);
            case 109: return '.' + decodeString(reader.uint32(), reader);
            case 110: return decodeBignum(reader.uint8(), reader);
            case 111: return decodeBignum(reader.uint32(), reader);
            case 115: return ':' + decodeString(reader.uint8(), reader);
            case 116: return decodeMap(reader);
            case 118: return ':' + decodeString(reader.uint16(), reader);
            case 119: return ':' + decodeString(reader.uint8(), reader);
        }
        function decodeString(len: number, reader: Stream.Reader) {
            return Utf8.decode(reader.vector(len));
        }
        function decodeTuple(len: number, reader: Stream.Reader) {
            let result = [];
            let i;
            for (i = 0; i < len; i++) {
                result.push(doDecode(reader));
            }
            return {_: result};
        }
        function decodeList(reader: Stream.Reader) {
            let len = reader.uint32();
            let result = [];
            let i;
            for (i = 0; i < len - 1; i++) {
                result.push(doDecode(reader));
            }
            let tail = doDecode(reader);
            if (!('object' typeof tail && tail instanceof Array && tail.length == 0))
                result.push(tail);
            return result;
        }
        function decodeMap(reader: Stream.Reader) {
            let len = reader.uint32();
            let result = {};
            let i;
            for (i = 0; i < len; i++) {
                let key = doDecode(reader);
                result[key] = doDecode(reader);
            }
            return result;
        }
        function decodeBignum(len: number, reader: Stream.Reader) {
            let sign = (0 === reader.uint8()) ? 1 : -1;
            let result = 0;
            let i;
            for (i = 0; i < len; i++) {
                result += reader.uint8() * Math.pow(256, i);
            }
            return sign * result;
        }
    }
}