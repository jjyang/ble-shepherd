/* jshint node: true */
'use strict';

var Q = require('q'),
    _ = require('busyman'),
    proving = require('proving');

var BDEFS = require('../defs/bledefs'),
    GAPDEFS = require('../defs/gapdefs');

function Secmdl(setting) {
    this._peripheral = null;
    this.state = 'unencrypted'; //'encrypted', 'unencrypted'
    this.pairMode = !_.isNil(setting.pairMode) ? setting.pairMode : GAPDEFS.PairingMode.get('WaitForReq').value;
    this.ioCap = !_.isNil(setting.ioCap) ? setting.ioCap : GAPDEFS.IoCap.get('KeyboardDisplay').value; 
    this.mitm = !_.isNil(setting.mitm) ? setting.mitm : true;
    this.bond = !_.isNil(setting.bond) ? setting.bond : true;
    this.ltk = null;
    this.div = null;
    this.rand = null;
}

Secmdl.prototype.setParam = function (param, val) {
    var paramId,
        value;

    proving.stringOrNumber(param, 'param must be a number or string');
    proving.number(val, 'val must be a number');

    paramId = GAPDEFS.BondParam[param];

    if (paramId) 
        paramId = paramId.value;        
    else 
        throw new Error('Param input error.');

    if (paramId === 0x0408) 
        value = new Buffer([val >> 24, (val >> 16) & 0xFF, (val >> 8) & 0xFF, val & 0xFF]);
    else 
        value = new Buffer([val]);

    return this._peripheral._controller.setBondParam(paramId, value);
};

Secmdl.prototype.init = function () {
    var self = this,
        mitm = this.mitm ? 1 : 0,
        bond = this.bond ? 1 : 0;

    return this.setParam('PairingMode', this.pairMode).then(function () {
        return self.setParam('MitmProtection', mitm);
    }).then(function () {
        return self.setParam('IoCap', self.ioCap);
    }).then(function () {
        return self.setParam('BondingEnabled', bond);
    });
};

Secmdl.prototype.returnPasskey = function (passkey, callback) {
    return this._peripheral._controller.passkeyUpdate(this._peripheral, passkey);
};

Secmdl.prototype.pairing = function () {
    var self = this;

    return this._peripheral._controller.authenticate(this._peripheral, this.ioCap, this.mitm, this.bond)
    .then(function (result) {
        if (result.status === BDEFS.GenericStatus.SUCCESS.value) {
            self.ltk = result.dev_ltk;
            self.div = result.dev_div;
            self.rand = result.dev_rand;
        } else if (self.mitm) {
            self.mitm = false;
            self.setParam('MitmProtection', 0).then(function () {
                setImmediate(function () {
                    self.pairing();
                });
			});
        } else {
            throw new Error('Pairing not allowed.');
        }
    });
};

Secmdl.prototype.cancelPairing = function () {
    return this._peripheral._controller.terminateAuth(this._peripheral, 3);
};

Secmdl.prototype.bonding = function () {
    var self = this,
        deferred = Q.defer(),
        mitm = this.mitm ? 1 : 0,
        setting = {
            ltk: this.ltk,
            div: this.div,
            rand: this.rand
        };

    if (!this.ltk || !this.div || !this.rand) {
        deferred.reject(new Error('No complete information to bond to a device.'));
    } else { 
        return this._peripheral._controller.bond(this._peripheral, mitm, setting);
    }

    return deferred.promise;
};

module.exports = Secmdl;