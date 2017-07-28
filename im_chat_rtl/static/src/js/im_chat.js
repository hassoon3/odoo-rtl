(function(){

    "use strict";

    var _t = openerp._t;
    var _lt = openerp._lt;
    var QWeb = openerp.qweb;
    var NBR_LIMIT_HISTORY = 20;
    var USERS_LIMIT = 20;
    var im_chat = openerp.im_chat;

    im_chat.ConversationManager.include({
        init: function(parent, options) {
            var self = this;
            openerp.Widget.prototype.init.apply(this, parent);
            this.options = _.clone(options) || {};
            _.defaults(this.options, {
                inputPlaceholder: _t("Say something..."),
                defaultMessage: null,
                defaultUsername: _t("Visitor"),
            });
            // business
            this.sessions = {};
            this.bus = openerp.bus.bus;
            this.bus.on("notification", this, this.on_notification);
            this.bus.options["im_presence"] = true;

            // ui
            this.set("left_offset", 0);
            this.set("bottom_offset", 0);
            this.on("change:left_offset", this, this.calc_positions);
            this.on("change:bottom_offset", this, this.calc_positions);

            this.set("window_focus", true);
            this.on("change:window_focus", self, function(e) {
                self.bus.options["im_presence"] = self.get("window_focus");
            });
            this.set("waiting_messages", 0);
            this.on("change:waiting_messages", this, this.window_title_change);
            $(window).on("focus", _.bind(this.window_focus, this));
            $(window).on("blur", _.bind(this.window_blur, this));
            this.window_title_change();
        },
        calc_positions: function() {
            var self = this;
            var current = this.get("left_offset");
            _.each(this.sessions, function(s) {
                s.set("bottom_position", self.get("bottom_offset"));
                s.set("left_position", current);
                current += s.$().outerWidth(true);
            });
        }
    });

    im_chat.Conversation.include({
        init: function(parent, c_manager, session, options) {
            openerp.Widget.prototype.init.apply(this, parent);
            this.c_manager = c_manager;
            this.options = options || {};
            this.loading_history = true;
            this.set("messages", []);
            this.set("session", session);
            this.set("left_position", 0);
            this.set("bottom_position", 0);
            this.set("pending", 0);
            this.inputPlaceholder = this.options.defaultInputPlaceholder;
        },
        start: function() {
            var self = this;
            self.$().append(openerp.qweb.render("im_chat.Conversation", {widget: self}));
            self.$().hide();
            self.on("change:session", self, self.update_session);
            self.on("change:left_position", self, self.calc_pos);
            self.on("change:bottom_position", self, self.calc_pos);
            self.full_height = self.$().height();
            self.calc_pos();
            self.on("change:pending", self, _.bind(function() {
                if (self.get("pending") === 0) {
                    self.$(".oe_im_chatview_nbr_messages").text("");
                } else {
                    self.$(".oe_im_chatview_nbr_messages").text("(" + self.get("pending") + ")");
                }
            }, self));
            // messages business
            self.on("change:messages", this, this.render_messages);
            self.$('.oe_im_chatview_content').on('scroll',function(){
                if($(this).scrollTop() === 0){
                    self.load_history();
                }
            });
            self.load_history();
            self.$().show();
            // prepare the header and the correct state
            self.update_session();
        },
        calc_pos: function() {
            this.$().css("left", this.get("left_position"));
            this.$().css("bottom", this.get("bottom_position"));
        }
    });
	
    im_chat.InstantMessaging.include({
        init: function(parent) {
            openerp.Widget.prototype.init.apply(this, parent);
            this.shown = false;
            this.set("left_offset", 0);
            this.set("current_search", "");
            this.users = [];
            this.widgets = {};

            this.c_manager = new openerp.im_chat.ConversationManager(this);
            this.on("change:left_offset", this.c_manager, _.bind(function() {
                this.c_manager.set("left_offset", this.get("left_offset"));
            }, this));
            this.user_search_dm = new openerp.web.DropMisordered();
        },
        start: function() {
            var self = this;
            this.$el.css("left", -this.$el.outerWidth());
            $(window).scroll(_.bind(this.calc_box, this));
            $(window).resize(_.bind(this.calc_box, this));
            this.calc_box();

            this.on("change:current_search", this, this.search_users_status);

            // add a drag & drop listener
            self.c_manager.on("im_session_activated", self, function(conv) {
                conv.$el.droppable({
                    drop: function(event, ui) {
                        conv.add_user(ui.draggable.data("user"));
                    }
                });
            });
            // add a listener for the update of users status
            this.c_manager.on("im_new_user_status", this, this.update_users_status);

            // fetch the unread message and the recent activity (e.i. to re-init in case of refreshing page)
            openerp.session.rpc("/im_chat/init",{}).then(function(notifications) {
                _.each(notifications, function(notif){
                    self.c_manager.on_notification(notif);
                });
                // start polling
                openerp.bus.bus.start_polling();
            });
            return;
        },
        switch_display: function() {
            this.calc_box();
            var fct =  _.bind(function(place) {
                this.set("left_offset", place + this.$el.outerWidth());
            }, this);
            var opt = {
                step: fct,
            };
            if (this.shown) {
                this.$el.animate({
                    //right: -this.$el.outerWidth(),
					left: -this.$el.outerWidth(),
                }, opt);
            } else {
                if (! openerp.bus.bus.activated) {
                    this.do_warn("Instant Messaging is not activated on this server. Try later.", "");
                    return;
                }
                // update the list of user status when show the IM
                this.search_users_status();
                this.$el.animate({
                    //right: 0,
					left: 0,
                }, opt);
            }
            this.shown = ! this.shown;
        }
    });

})();
